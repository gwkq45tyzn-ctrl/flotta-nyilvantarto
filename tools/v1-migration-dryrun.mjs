/**
 * V1 Fleet local-only synthetic migration PREVIEW.
 * Never connects to Firebase, Apps Script, or any network resource.
 * It cannot approve, seal or execute a migration.
 */
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {canonicalStringify} from '../features/migration-manifest.mjs';

const COLLECTIONS=Object.freeze(['vehicles','drivers','fuelCards','contacts']);
const JSON_BUDGET=800*1024; // Conservative filter, NOT Firestore document-size proof.
const hex64=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&
  (Object.getPrototypeOf(v)===Object.prototype||Object.getPrototypeOf(v)===null);
const own=(obj,key)=>Object.prototype.hasOwnProperty.call(obj,key);
const clone=o=>JSON.parse(canonicalStringify(o));
export function sha256(obj) {
  return createHash('sha256').update(canonicalStringify(obj),'utf8').digest('hex');
}
const normDA=s=>typeof s==='string'&&/^[A-Za-z0-9_-]{4,40}$/.test(s.trim())
  ?s.trim().toUpperCase():'';
const normPlate=s=>typeof s==='string'&&/^[A-Za-z0-9 -]{4,40}$/.test(s)
  ?s.replace(/[ -]/g,'').toUpperCase():'';
function richList(snapshot,key,errors) {
  const records=Array.isArray(snapshot?.[key])?snapshot[key]:[];
  if(!Array.isArray(snapshot?.[key])) {
    errors.push('Missing or invalid '+key+' array');
    return records;
  }
  const internalIds=new Set();
  for(let i=0;i<records.length;i++){
    const row=records[i];
    if(!plain(row)){errors.push('Invalid '+key+'['+i+'] record');continue;}
    if(own(row,'history')&&!Array.isArray(row.history))
      errors.push('Invalid history at '+key+'['+i+']');
    if((key==='drivers'||key==='vehicles')&&
       (typeof row.id!=='string'||!row.id.trim()||internalIds.has(row.id)))
      errors.push('Missing/duplicate internal record ID at '+key+'['+i+']');
    // `sourceIndex` is a reserved PRIVILEGED attestation inserted only
    // after full normalized uniqueness and rich provenance preflight.
    // A conflicting value in the raw legacy data must not be overwritten.
    if((key==='drivers'||key==='vehicles')&&
       own(row,'sourceIndex')&&row.sourceIndex!==i)
      errors.push('Reserved sourceIndex collision at '+key+'['+i+']');
    if(typeof row.id==='string')internalIds.add(row.id);
    if(own(row,'revision')&&(!Number.isSafeInteger(row.revision)||row.revision<1))
      errors.push('Invalid existing revision at '+key+'['+i+']');
  }
  return records;
}
export function preflight(snapshot) {
  const errors=[];
  if(!plain(snapshot))errors.push('Invalid snapshot');
  const lists=Object.fromEntries(COLLECTIONS.map(k=>[k,richList(snapshot,k,errors)]));
  const da=new Set(),plates=new Set();
  for(const [i,d] of lists.drivers.entries()){
    const id=normDA(d?.daCode);
    if(!id)errors.push('Bad DA at drivers['+i+']');
    else if(da.has(id))errors.push('Duplicate DA '+id);
    da.add(id);
  }
  for(const [i,v] of lists.vehicles.entries()){
    const id=normPlate(v?.rendszam);
    if(!id||id.length<4||id.length>40)errors.push('Bad plate at vehicles['+i+']');
    else if(plates.has(id))errors.push('Duplicate plate '+id);
    plates.add(id);
  }
  let sourceSha256=null,jsonBytes=null;
  try {
    const canonical=canonicalStringify(snapshot);
    jsonBytes=Buffer.byteLength(canonical,'utf8');
    sourceSha256=createHash('sha256').update(canonical,'utf8').digest('hex');
    if(jsonBytes>JSON_BUDGET)errors.push('Conservative UTF-8 JSON budget exceeded (Firestore encoded size remains unverified)');
  }catch(e){errors.push('Source is not strict JSON: '+String(e.message||e));}
  return {
    ok:errors.length===0,errors,sourceSha256,jsonBytes,
    counts:Object.fromEntries(COLLECTIONS.map(k=>[k,lists[k].length])),
    requiresFirestoreEncodedSizeCheck:true,
    authorizedForImport:false
  };
}
export function buildPlan(snapshot,claimedPreflight) {
  const trusted=preflight(snapshot);
  if(!trusted.ok)throw Error('Preflight failed: '+trusted.errors.join('; '));
  if(claimedPreflight&&(!claimedPreflight.ok||
    claimedPreflight.sourceSha256!==trusted.sourceSha256))
    throw Error('Preflight input/SHA mismatch – refuse plan');
  const keyed=(key,field,normalize)=>snapshot[key].map((row,sourceIndex)=>({
    id:normalize(row[field]),
    data:{...clone(row),sourceIndex,
      revision:own(row,'revision')?row.revision:1}
  })).sort((a,b)=>a.id.localeCompare(b.id));
  return {
    version:'v1-offline-plan-2',sourceSha256:trusted.sourceSha256,
    sourceCounts:trusted.counts,sourceJsonBytes:trusted.jsonBytes,
    requiresPrivilegedImporter:true,requiresSourceParityBeforeSeal:true,
    firestoreEncodedSizeVerified:false,authorizedForImport:false,
    sealed:true, // Proposed desired final state, NOT an executed or approved seal.
    drivers:keyed('drivers','daCode',normDA),
    vehicles:keyed('vehicles','rendszam',normPlate),
    fuelCards:clone(snapshot.fuelCards),contacts:clone(snapshot.contacts)
  };
}
export function simulateBackup(snapshot) {
  const pre=preflight(snapshot);
  if(!pre.ok)throw Error('Backup source invalid: '+pre.errors.join('; '));
  return {
    type:'v1-full-rich-backup',
    version:2,
    sourceSha256:pre.sourceSha256,
    counts:pre.counts,
    snapshot:clone(snapshot),
    imported:false
  };
}
export function restoreDrill(backup,expectedSha) {
  const blocked=error=>({ok:false,error,historyPreserved:false});
  if(!plain(backup)||backup.type!=='v1-full-rich-backup'||!hex64(expectedSha))
    return blocked('Invalid backup or trusted expected SHA');
  if(backup.sourceSha256!==expectedSha)return blocked('SHA mismatch – refuse restore');
  const pre=preflight(backup.snapshot);
  if(!pre.ok)return blocked('Invalid/tampered backup snapshot: '+pre.errors.join('; '));
  if(pre.sourceSha256!==expectedSha)return blocked('SHA mismatch – backup content tampered');
  if(backup.counts&&COLLECTIONS.some(k=>backup.counts[k]!==pre.counts[k]))
    return blocked('Backup count mismatch');
  return {
    ok:true,sourceSha256:pre.sourceSha256,restoredCounts:pre.counts,
    historyPreserved:true,fullRichSourceParityVerified:true,
    authorizedForImport:false
  };
}
/**
 * Local migration completeness proof: exact keyed record identity and
 * all rich content must match, not just document count or paths.
 * Old flat ID-only fixtures are intentionally NOT considered proof.
 */
export function detectPartial(plan,currentKeyed) {
  if(!plain(plan)||!Array.isArray(plan.drivers)||!Array.isArray(plan.vehicles))
    return {complete:false,missing:[],mismatched:['invalid plan'],unexpected:[]};
  const keyed=plain(currentKeyed)?currentKeyed:{};
  const namespaces=plain(keyed.drivers)&&plain(keyed.vehicles);
  const missing=[],mismatched=[],unexpected=[];
  for(const kind of ['drivers','vehicles']){
    const expected=plan[kind],rows=namespaces?keyed[kind]:keyed;
    const ids=new Set();
    for(const item of expected){
      const id=String(item.id);
      if(ids.has(id))mismatched.push(kind+'/'+id+' duplicate plan identity');
      ids.add(id);
      if(!own(rows,id))missing.push(kind+'/'+id);
      else{
        try{if(sha256(rows[id])!==sha256(item.data))mismatched.push(kind+'/'+id);}
        catch(e){mismatched.push(kind+'/'+id);}
      }
    }
    if(namespaces)for(const id of Object.keys(rows)){
      if(!ids.has(id))unexpected.push(kind+'/'+id);
    }
  }
  if(!namespaces)unexpected.push('unverified unscoped currentKeyed format');
  return {
    complete:missing.length===0&&mismatched.length===0&&unexpected.length===0,
    missing,mismatched,unexpected
  };
}
function argsOf(rest) {
  const options={};
  for(let i=0;i<rest.length;i++){
    const flag=rest[i],match=/^--(input|output|backup|expected-sha)(?:=(.*))?$/.exec(flag);
    if(!match||own(options,match[1]))throw Error('Unknown/duplicate argument: '+flag);
    const value=match[2]??rest[++i];
    if(!value||value.startsWith('--'))throw Error('Missing value for '+flag);
    options[match[1]]=value;
  }
  return options;
}
function cli() {
  try{
    const command=process.argv[2];
    if(!['preflight','dry-run','backup','restore-drill'].includes(command))
      throw Error('Use preflight|dry-run|backup|restore-drill');
    const opts=argsOf(process.argv.slice(3));
    const snapshot=command==='restore-drill'
      ?JSON.parse(readFileSync(opts.backup||'', 'utf8'))
      :JSON.parse(readFileSync(opts.input||'', 'utf8'));
    let result;
    if(command==='preflight')result=preflight(snapshot);
    else if(command==='dry-run')result=buildPlan(snapshot);
    else if(command==='backup')result=simulateBackup(snapshot);
    else result=restoreDrill(snapshot,opts['expected-sha']);
    if(opts.output) {
      // Local file only; never overwrite an existing backup or audit artifact.
      writeFileSync(opts.output,JSON.stringify(result,null,2)+'\n',
        {encoding:'utf8',flag:'wx',mode:0o600});
    }
    // No personal record or full plan in CLI output by default.
    console.log(JSON.stringify({
      ok:command==='preflight'?result.ok:command==='restore-drill'?result.ok:true,
      sourceSha256:result.sourceSha256||null,
      counts:result.counts||result.restoredCounts||result.sourceCounts||null,
      outputWritten:Boolean(opts.output),
      authorizedForImport:false,
      errors:result.errors||result.error||null
    },null,2));
    if((command==='preflight'||command==='restore-drill')&&!result.ok)
      process.exitCode=2;
  }catch(e){
    console.error('V1 local migration drill BLOCKED: '+String(e.message||e));
    process.exitCode=2;
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)cli();
