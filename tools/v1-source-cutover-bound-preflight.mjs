/**
 * Phase-1 iMile Fleet + Depot: LOCAL, READ-ONLY, PRIVATE evidence binding.
 *
 * Binds the raw full-rich 4-array Fleet export to the owner's redacted Apps
 * Script writer inventory by comparing the independently calculated canonical
 * Fleet SHA-256 with the inventory's declared sourceSha256.
 *
 * This solves a false-green combination: a individually clean Fleet export and
 * a separately clean cutover inventory could previously refer to DIFFERENT
 * source snapshots. Matching digest is a LOCAL consistency check only: both
 * files remain self-supplied, not independently attested or production GO.
 *
 * Usage: node tools/v1-source-cutover-bound-preflight.mjs \
 *   --fleet /private/fleet-rich.json \
 *   --legacy-writers /private/legacy-writers-redacted.json [--json]
 *
 * Never uses a cloud client, uploads, modifies, creates a manifest or writes
 * files. Never prints fleet fields, IDs, aliases, contacts, URLs, file paths,
 * raw errors, or owner inventory reference names.
 */
import {lstatSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {assessPrivateFleetExport} from './v1-owner-readiness-cli.mjs';
import {assessAppsScriptCutoverEvidence} from './v1-apps-script-cutover-evidence.mjs';

export const BOUND_PREFLIGHT_SCHEMA='imile-v1-local-source-cutover-binding-1';
const MAX_FLEET_BYTES=1_200_000,MAX_WRITER_BYTES=256*1024;
const hex64=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);

function base(reason){
  return {
    schema:BOUND_PREFLIGHT_SCHEMA,
    locallyBoundAndReady:false,
    crossEvidenceSha256Matched:false,
    reasons:[reason],
    source:null,legacyWriters:null,
    independentlyPinnedSource:false,
    ownerInventoryAuthenticated:false,
    actualDeploymentsVerified:false,
    productionIamVerified:false,
    localFirestoreProtoSizeVerified:false,
    productionFirestoreSizeVerified:false,
    ownerReleaseApproved:false,
    productionReleaseAuthorized:false,
    authorizedForImport:false,
    readOnly:true
  };
}

export function assessSourceAndLegacyCutover(source,manifest,{now=Date.now()}={}){
  let fleet,cutover;
  try{fleet=assessPrivateFleetExport(source);}
  catch{return base('PRIVATE_FLEET_PREFLIGHT_ERROR');}
  try{cutover=assessAppsScriptCutoverEvidence(manifest,{now});}
  catch{return base('PRIVATE_LEGACY_MANIFEST_CHECK_ERROR');}

  const fleetDigest=fleet.sourcePreflightOk&&
    hex64(fleet.untrustedLocalSourceSha256)?fleet.untrustedLocalSourceSha256:null;
  const manifestDigest=hex64(manifest?.sourceSha256)?manifest.sourceSha256:null;
  const comparable=Boolean(fleetDigest&&manifestDigest);
  const matched=comparable&&fleetDigest===manifestDigest;
  const reasons=[];
  if(!fleet.sourcePreflightOk)reasons.push('FLEET_RICH_SOURCE_PREFLIGHT_DENIED');
  if(!fleet.operationallyReady)reasons.push('FLEET_OPERATIONAL_PREFLIGHT_DENIED');
  if(!cutover.locallyComplete)reasons.push('LEGACY_WRITER_LOCAL_INVENTORY_DENIED');
  if(!comparable)reasons.push('SOURCE_MANIFEST_DIGEST_NOT_COMPARABLE');
  else if(!matched)reasons.push('SOURCE_MANIFEST_SHA256_MISMATCH');

  return {
    ...base('NOT_AUTHORIZED_FOR_PRODUCTION'),
    reasons,
    locallyBoundAndReady:reasons.length===0,
    crossEvidenceSha256Matched:matched,
    // Only explicitly redacted existing verdicts are surfaced, never the
    // source, manifest, paths, raw errors, IDs, tokens or actual SHA values.
    source:{
      sourcePreflightOk:fleet.sourcePreflightOk,
      operationallyReady:fleet.operationallyReady,
      reasons:fleet.reasons,warnings:fleet.warnings,counts:fleet.counts
    },
    legacyWriters:{
      locallyComplete:cutover.locallyComplete,
      noActiveFleetWriterClaimed:cutover.noActiveFleetWriterClaimed,
      reasons:cutover.reasons,counts:cutover.counts
    }
  };
}

function output(result,json){
  if(json){process.stdout.write(JSON.stringify(result,null,2)+'\n');return;}
  const lines=[
    'iMile Flotta + Depó – PRIVÁT FORRÁS / RÉGI ÍRÓK KÖZÖS ELLENŐRZÉS',
    'Helyi állapot: '+(result.locallyBoundAndReady?
      'A KÉT HELYI NYILVÁNTARTÁS ÖSSZEILLŐ':'ÁTVÁLTÁS BLOKKOLVA'),
    'Forrás és leltár ugyanazt a SHA-256-ot tartalmazza: '+
      (result.crossEvidenceSha256Matched?'IGEN (önbevallás)':'NEM / NEM BIZONYÍTHATÓ'),
    'Kizáró okok: '+(result.reasons.join(', ')||'nincs helyi eltérés'),
    'ÉLESÍTÉS TILOS: a valós backup, éles telepített írók, IAM, független forráspin és kiadási GO még külön bizonyítandó.'
  ];
  process.stdout.write(lines.join('\n')+'\n');
}

function readPrivateJson(path,maxBytes){
  const st=lstatSync(path);
  if(!st.isFile()||st.isSymbolicLink()||!Number.isSafeInteger(st.size)||
     st.size<1||st.size>maxBytes)throw Error('PRIVATE_INPUT_DENIED');
  return JSON.parse(readFileSync(path,'utf8'));
}

export function runBoundOwnerPreflight(argv=process.argv.slice(2)){
  const json=argv.includes('--json');
  const args=argv.filter(x=>x!=='--json');
  if(argv.filter(x=>x==='--json').length>1||
     args.length!==4||args.some(x=>typeof x!=='string')){
    output(base('INVALID_ARGUMENTS'),json);return 1;
  }
  const flags={};
  for(let i=0;i<args.length;i+=2){
    const name=args[i],value=args[i+1];
    if(!['--fleet','--legacy-writers'].includes(name)||
       Object.hasOwn(flags,name)||!value||value.startsWith('-')){
      output(base('INVALID_ARGUMENTS'),json);return 1;
    }
    flags[name]=value;
  }
  if(!flags['--fleet']||!flags['--legacy-writers']){
    output(base('INVALID_ARGUMENTS'),json);return 1;
  }
  let fleet,manifest;
  try{fleet=readPrivateJson(flags['--fleet'],MAX_FLEET_BYTES);}
  catch{output(base('FLEET_PRIVATE_FILE_UNREADABLE_OR_INVALID'),json);return 1;}
  try{manifest=readPrivateJson(flags['--legacy-writers'],MAX_WRITER_BYTES);}
  catch{output(base('LEGACY_PRIVATE_FILE_UNREADABLE_OR_INVALID'),json);return 1;}
  let result;
  try{result=assessSourceAndLegacyCutover(fleet,manifest);}
  catch{output(base('PRIVATE_BINDING_PREFLIGHT_FAILED'),json);return 1;}
  output(result,json);
  return result.locallyBoundAndReady?0:2;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))
  process.exitCode=runBoundOwnerPreflight();
