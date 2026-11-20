/**
 * Read-only Fleet migration reconciliation against explicitly provided PRIVATE
 * local, legacy server, pending-local and backup export files.
 *
 * NEVER sends content to GitHub, Firebase or a third-party service; prints no
 * names/addresses/phones/records. Offline parity is NOT approval or proof of
 * authoritative Apps Script source or Firebase document encoded size.
 *
 * Run (locally with private JSON only, never commit the files):
 *   node features/fleet-migration-dryrun.mjs \
 *      --local /private/flotta-local.json \
 *      --server /private/flotta-legacy-server.json \
 *      --backup /private/flotta-backup.json \
 *      [--pending /private/flotta-pending.json]
 */
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {createMigrationManifest} from './migration-manifest.mjs';
import {planSharedMigration} from './shared-master-adapter.mjs';

const required=['local','server','backup'];

function assessOne(snapshot,name){
  try{
    const m=createMigrationManifest(snapshot);
    const p=planSharedMigration(snapshot);
    return {
      name,
      valid:true,
      hash:m.sourceHash,
      counts:m.counts,
      jsonBytes:m.jsonBytes,
      overConservativeBudget:!m.withinConservativeJsonBudget,
      mappingReady:p.ready,
      mappingIssueCount:p.issues.length
    };
  }catch(error){
    return {name,valid:false,reason:String(error.message||error)};
  }
}

/**
 * This is a local decision-support report, NOT a release or data-import GO.
 * Absent pending means caller has independently established no pending edits.
 */
export function prepareFleetMigrationDryRun({local,server,backup,pending=null}={}){
  const inputs={local,server,backup};
  if(pending!==null&&pending!==undefined)inputs.pending=pending;
  const records=Object.fromEntries(Object.entries(inputs).map(([k,v])=>[
    k,v==null?{name:k,valid:false,reason:'Source file not provided'}:assessOne(v,k)
  ]));
  const holds=[];
  for(const name of required){
    const r=records[name];
    if(!r?.valid)holds.push({code:'MISSING_OR_INVALID_SOURCE',source:name});
    else if(!r.mappingReady)holds.push({
      code:'UNRESOLVED_MASTER_MAPPING',source:name,issues:r.mappingIssueCount
    });
    if(r?.overConservativeBudget)holds.push({
      code:'JSON_SIZE_BUDGET_EXCEEDED',source:name,bytes:r.jsonBytes
    });
  }
  if(records.pending){
    if(!records.pending.valid||!records.pending.mappingReady)
      holds.push({code:'PENDING_SOURCE_INVALID_OR_UNMAPPED'});
    else if(records.server?.valid&&records.pending.hash!==records.server.hash)
      holds.push({code:'UNRESOLVED_PENDING_LOCAL_CHANGES'});
  }
  if(records.local?.valid&&records.server?.valid&&
     records.local.hash!==records.server.hash)
    holds.push({code:'LOCAL_VS_LEGACY_SERVER_CONFLICT'});
  if(records.server?.valid&&records.backup?.valid&&
     records.server.hash!==records.backup.hash)
    holds.push({code:'BACKUP_PARITY_CONFLICT'});
  const hashes=Object.fromEntries(Object.entries(records).map(([key,r])=>[key,r.hash??null]));
  const counts=Object.fromEntries(Object.entries(records).map(([key,r])=>[key,r.counts??null]));
  const sizes=Object.fromEntries(Object.entries(records).map(([key,r])=>[key,r.jsonBytes??null]));
  return Object.freeze({
    version:'offline-source-reconciliation-v1',
    status:holds.length?'blocked':'source-parity-review-only',
    writesAllowed:false,
    firebaseConnected:false,
    serverSourceAuthenticated:false,
    backupRestoreIndependentlyTested:false,
    firestoreEncodedSizeVerified:false,
    migrationAuthorized:false,
    hashes,counts,jsonBytes:sizes,holds,
    note:'Forrásfájlok egyezése önmagában nem bizonyít hiteles Apps Script szerververziót, 1 MiB Firestore méretet, visszaállítási tesztet vagy végleges élesítési jóváhagyást. Nem történt adatimport.'
  });
}

export function parsePrivateInputArgs(args){
  const paths={};
  for(let i=0;i<args.length;i+=2){
    const key=args[i]?.replace(/^--/,'');
    const value=args[i+1];
    if(!['local','server','backup','pending'].includes(key)||!args[i].startsWith('--')||!value)
      throw Error('Use --local FILE --server FILE --backup FILE [--pending FILE] (private local paths only)');
    if(paths[key])throw Error('Duplicate --'+key);
    paths[key]=value;
  }
  if(required.some(k=>!paths[k]))
    throw Error('Missing required private export file: local, server, backup');
  return paths;
}
function printUsage(){
  console.log('Offline Fleet source comparison (read-only, no networking).');
  console.log('node features/fleet-migration-dryrun.mjs --local FILE --server FILE --backup FILE [--pending FILE]');
  console.log('PRIVATE DATA: do not upload exports or log raw JSON to GitHub.');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  if(process.argv.includes('--help'))printUsage();
  else{
    try{
      const files=parsePrivateInputArgs(process.argv.slice(2));
      const input=Object.fromEntries(Object.entries(files).map(([key,p])=>[
        key,JSON.parse(fs.readFileSync(p,'utf8'))
      ]));
      const report=prepareFleetMigrationDryRun(input);
      console.log(JSON.stringify(report,null,2));
      if(report.holds.length)process.exitCode=2;
    }catch(error){
      console.error('Local reconciliation BLOCKED: '+String(error.message||error));
      process.exitCode=2;
    }
  }
}
