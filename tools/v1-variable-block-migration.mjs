/**
 * Variable four-block Fleet migration planner.
 * Local/synthetic only. Counts come from the source arrays. A caller-supplied
 * production total is rejected. Source preflight is not a closing approval,
 * and a storage estimate is not Firestore wire-size proof.
 */
import {buildPlan,preflight,sha256} from './v1-migration-dryrun.mjs';
import {checkSizeGate} from './v1-firestore-size-gate.mjs';

const BLOCKS=['drivers','vehicles','fuelCards','contacts'];
export const PAIR_CHUNK=8;
/** Firestore Commit/WriteBatch ceiling is 500. Stay under it. */
export const MAX_BATCH_WRITES=450;

const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);

export function syntheticFourBlockSource(counts){
  if(!counts||typeof counts!=='object'||Array.isArray(counts))
    throw TypeError('INVALID_BLOCK_COUNTS');
  if(own(counts,'expectedProductionCount')||own(counts,'productionRecordCount'))
    throw Error('PRODUCTION_RECORD_COUNT_MUST_NOT_BE_HARDCODED');
  const unknown=Object.keys(counts).filter(k=>!BLOCKS.includes(k));
  if(unknown.length)throw Error('UNKNOWN_SOURCE_OPTION');
  for(const key of BLOCKS){
    if(!Number.isSafeInteger(counts[key])||counts[key]<0||counts[key]>2000)
      throw Error('INVALID_BLOCK_COUNT:'+key);
  }
  const note=i=>'árvíztűrő tükörfúrógép '+i+' 📦';
  const drivers=Array.from({length:counts.drivers},(_,i)=>({
    id:'synthetic-driver-'+(i+1),
    daCode:'DA'+String(i+1).padStart(4,'0'),
    name:'SYNTHETIC COURIER '+(i+1),
    status:'aktiv',
    kapacitas:40+(i%50),
    agency:'SYNTHETIC',
    history:[{kind:'hire',when:'2026-01-01',text:note(i),
      details:{provenance:'synthetic',seq:i}}]
  }));
  const vehicles=Array.from({length:counts.vehicles},(_,i)=>({
    id:'synthetic-vehicle-'+(i+1),
    rendszam:'TST-'+String(i+1).padStart(4,'0'),
    status:'aktiv',
    gyartmany:'SYNTHETIC',
    km:1000+i,
    history:[{kind:'service',when:'2026-01-02',text:note(i),
      details:{km:1000+i,nested:{keep:true}}}]
  }));
  const fuelCards=Array.from({length:counts.fuelCards},(_,i)=>({
    id:'synthetic-fuel-'+(i+1),
    history:[{kind:'issue',when:'2026-01-01',text:note(i)}]
  }));
  const contacts=Array.from({length:counts.contacts},(_,i)=>({
    id:'synthetic-contact-'+(i+1),
    role:'synthetic',
    history:[{kind:'note',text:note(i)}]
  }));
  return {drivers,vehicles,fuelCards,contacts};
}

function claimFor(item,sourceSha256){
  return {
    sourceIndex:item.data.sourceIndex,
    revision:item.data.revision,
    migrationSourceSha256:sourceSha256,
    masterSha256:sha256(item.data)
  };
}

export function projectBlockPairs(source){
  const pre=preflight(source);
  if(!pre.ok)throw Error('PREFLIGHT_DENIED: '+pre.errors.join('; '));
  const plan=buildPlan(source,pre);
  if(plan.sealed!==false||plan.closingTrust!=='not-closed'||
     plan.sourceTrust!=='preflight-only'||plan.authorizedForImport!==false)
    throw Error('SOURCE_PLAN_COLLAPSED_INTO_CLOSING_TRUST');
  for(const key of BLOCKS){
    if(plan.sourceCounts[key]!==source[key].length)
      throw Error('BLOCK_COUNT_DRIFT:'+key);
  }
  const pairs=[];
  for(const kind of ['drivers','vehicles']){
    const masterCol=kind==='drivers'?'flottaDrivers':'flottaVehicles';
    const claimCol=kind==='drivers'?'flottaDriverClaims':'flottaVehicleClaims';
    const rows=[...plan[kind]].sort((a,b)=>a.data.sourceIndex-b.data.sourceIndex);
    const seen=new Set();
    for(const item of rows){
      if(!Number.isSafeInteger(item.data.sourceIndex)||item.data.sourceIndex<0)
        throw Error('INVALID_SOURCE_INDEX');
      if(seen.has(item.data.sourceIndex))throw Error('DUPLICATE_SOURCE_INDEX');
      seen.add(item.data.sourceIndex);
      const claim=claimFor(item,plan.sourceSha256);
      pairs.push({
        kind,id:item.id,sourceIndex:item.data.sourceIndex,
        masterPath:masterCol+'/'+item.id,
        claimPath:claimCol+'/'+item.id,
        master:item.data,claim
      });
    }
  }
  const docs={};
  for(const pair of pairs){
    if(own(docs,pair.masterPath)||own(docs,pair.claimPath))
      throw Error('DUPLICATE_PLAN_PATH');
    docs[pair.masterPath]=pair.master;
    docs[pair.claimPath]=pair.claim;
  }
  const size=checkSizeGate(source,docs);
  if(!size.advisoryOk)
    throw Error('SIZE_GATE_DENIED_BEFORE_WRITE: '+size.reason);
  if(size.firestoreEncodedSizeVerified!==false||size.authorizedForImport!==false)
    throw Error('SIZE_ESTIMATE_PROMOTED_TO_AUTHORITY');
  return {
    pre,plan,pairs,size,
    counts:{...plan.sourceCounts},
    sourceSha256:plan.sourceSha256,
    sourceTrust:plan.sourceTrust,
    closingTrust:plan.closingTrust,
    firestoreEncodedSizeVerified:false,
    authorizedForImport:false
  };
}

export function chunkPairs(pairs,size=PAIR_CHUNK){
  if(!Array.isArray(pairs))throw TypeError('INVALID_PAIRS');
  if(!Number.isSafeInteger(size)||size<1||size>40)
    throw Error('INVALID_CHUNK');
  const chunks=[];
  for(let i=0;i<pairs.length;i+=size)chunks.push(pairs.slice(i,i+size));
  return chunks;
}

export function writesForDeletes(deleteCount,maxWrites=MAX_BATCH_WRITES){
  if(!Number.isSafeInteger(deleteCount)||deleteCount<0)
    throw Error('INVALID_DELETE_COUNT');
  if(!Number.isSafeInteger(maxWrites)||maxWrites<1||maxWrites>450)
    throw Error('INVALID_BATCH_CEILING');
  if(deleteCount===0)return [];
  const batches=[];
  for(let i=0;i<deleteCount;i+=maxWrites)
    batches.push(Math.min(maxWrites,deleteCount-i));
  return batches;
}

/**
 * Compare a persisted chunk with documents actually read back.
 * The checkpoint alone is not trusted: missing, extra, tampered, or
 * duplicate sourceIndex rows deny resume.
 */
export function assessChunkReadback({chunk,masters,claims,sourceSha256}){
  if(!Array.isArray(chunk)||chunk.length<1)
    return {ok:false,reason:'EMPTY_CHUNK'};
  if(typeof sourceSha256!=='string'||!/^[a-f0-9]{64}$/.test(sourceSha256))
    return {ok:false,reason:'SOURCE_SHA_DRIFT'};
  const masterMap=masters&&typeof masters==='object'?masters:{};
  const claimMap=claims&&typeof claims==='object'?claims:{};
  const indexes=new Map();
  for(const pair of chunk){
    const master=masterMap[pair.masterPath];
    const claim=claimMap[pair.claimPath];
    if(!master&&claim)return {ok:false,reason:'ORPHAN_CLAIM',id:pair.id};
    if(master&&!claim)return {ok:false,reason:'ORPHAN_MASTER',id:pair.id};
    if(!master&&!claim)return {ok:false,reason:'MISSING_PAIR',id:pair.id};
    if(sha256(master)!==sha256(pair.master))
      return {ok:false,reason:'RICH_MASTER_MISMATCH',id:pair.id};
    if(sha256(claim)!==sha256(pair.claim))
      return {ok:false,reason:'CLAIM_MISMATCH',id:pair.id};
    if(claim.migrationSourceSha256!==sourceSha256)
      return {ok:false,reason:'SOURCE_SHA_DRIFT',id:pair.id};
    const key=pair.kind+':'+claim.sourceIndex;
    if(indexes.has(key))return {ok:false,reason:'DUPLICATE_SOURCE_INDEX',id:pair.id};
    indexes.set(key,pair.id);
  }
  const masterPaths=new Set(chunk.map(pair=>pair.masterPath));
  const claimPaths=new Set(chunk.map(pair=>pair.claimPath));
  for(const id of Object.keys(masterMap)){
    if(!masterPaths.has(id))return {ok:false,reason:'ORPHAN_MASTER',id};
  }
  for(const id of Object.keys(claimMap)){
    if(!claimPaths.has(id))return {ok:false,reason:'ORPHAN_CLAIM',id};
  }
  return {ok:true,readBack:chunk.length};
}

export function localCloseDecision({sourceParity,approvalDocumentExists,alreadyClosed}){
  if(approvalDocumentExists)
    return {ok:false,reason:'CLOSING_TRUST_MUST_NOT_BE_MIGRATION_APPROVAL',
      sealed:false,authorizedForImport:false};
  if(alreadyClosed)
    return {ok:false,reason:'CLOSED_REPLAY_DENIED',
      sealed:false,authorizedForImport:false};
  if(sourceParity!==true)
    return {ok:false,reason:'SOURCE_TRUST_INCOMPLETE',
      sealed:false,authorizedForImport:false};
  return {
    ok:true,
    sourceTrust:'readback-verified',
    closingTrust:'locally-closed-not-production',
    sealed:false,
    authorizedForImport:false,
    productionClosingTrust:false,
    firestoreEncodedSizeVerified:false
  };
}

export function refuseUnseal(journal){
  if(journal?.closingTrust==='locally-closed-not-production'||journal?.closed===true)
    return {ok:false,reason:'POST_CLOSE_UNSEAL_DENIED',sealed:false,
      authorizedForImport:false,productionClosingTrust:false};
  return {ok:false,reason:'NOTHING_TO_UNSEAL',sealed:false,
    authorizedForImport:false};
}
