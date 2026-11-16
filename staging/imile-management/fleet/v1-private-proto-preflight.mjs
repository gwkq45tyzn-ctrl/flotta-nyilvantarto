/**
 * LOCAL/PRIVATE, READ-ONLY Firestore v1 Document protobuf size preflight for
 * an owner-exported full-rich four-array original Fleet snapshot.
 *
 * This uses the exact pinned Firebase JS SDK _local writeBatch serialization_
 * and the pinned @google-cloud/firestore-api Document protobuf encoder.
 * It never commits, reads remotely, authenticates, or accesses production.
 *
 * Usage (after installing the already pinned free local test dependencies):
 *   node staging/imile-management/fleet/v1-private-proto-preflight.mjs \
 *     --input /private/full-rich-flotta.json --json
 *
 * An SDK/encoder upgrade, malformed source, missing archive, or unsupported
 * representation must fail closed; no source data, path or raw exception leaks.
 */
import {readFileSync,statSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {initializeApp} from 'firebase/app';
import {getFirestore} from 'firebase/firestore';
import {measureDocumentSet,MAX_DOCUMENT_PROTO_BYTES}
  from './v1-firestore-wire-size.mjs';
import {projectBlockPairs} from '../../../tools/v1-variable-block-migration.mjs';
import {assessFleetDepotOperationalReadiness}
  from '../../../tools/v1-operational-readiness.mjs';

const MAX_INPUT_FILE_BYTES=1_200_000;
const SOURCE_PATH='flottaSharedState/current';
const MOCK_PROJECT='demo-imile-private-proto-size';
const importAuth={
  authorizedForImport:false,liveFirestoreMeasured:false,
  productionSourceAttested:false,productionIamVerified:false,
  productionCutoverVerified:false,ownerApprovalVerified:false,
  independentSourcePinVerified:false,
  productionFirestoreEncodedSizeVerified:false,
  readOnly:true
};
function refusal(reason){
  return {
    schema:'imile-v1-offline-firestore-proto-preflight-1',
    ok:false,locallySized:false,localSdkProtoEncodedSizeVerified:false,
    reason,counts:null,localSourceSha256:null,sourceDocumentProtoBytes:null,
    maxMasterDocumentProtoBytes:null,maxClaimDocumentProtoBytes:null,
    measuredDocuments:0,operationallyReady:false,
    ...importAuth
  };
}
function safeCounts(source,prepared,operational){
  return {
    drivers:prepared.counts.drivers,
    vehicles:prepared.counts.vehicles,
    fuelCards:prepared.counts.fuelCards,
    contacts:prepared.counts.contacts,
    keyedPairs:prepared.pairs.length,
    activeDrivers:operational.counts.activeDrivers,
    activeVehicles:operational.counts.activeVehicles,
    activeWithoutCapacity:operational.counts.activeWithoutCapacity,
    uncertainDriverStatuses:operational.counts.uncertainDriverStatuses
  };
}

/**
 * No network: writeBatch.set() only prepares SDK mutations in memory.
 * Exception text can carry PII (such as document paths), so callers should
 * NEVER surface raw errors to the user; every failure uses static codes.
 */
export function measurePrivateRichFleetSource(raw){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))
    return refusal('INVALID_FULL_RICH_SOURCE');
  if(Object.hasOwn(raw,'sealed')||Object.hasOwn(raw,'migrationSourceSha256'))
    return refusal('SOURCE_MIGRATED_OR_RESERVED_METADATA');
  // An original pre-import source can have revision:1; preserve the
  // same archive collision check as the synthetic VariableBlockSession.
  if(Object.hasOwn(raw,'revision')&&raw.revision!==1)
    return refusal('SOURCE_REVISION_COLLISION');
  let prepared;
  try{prepared=projectBlockPairs(raw);}
  catch{return refusal('SOURCE_PREFLIGHT_OR_ADVISORY_DENIED');}
  const operational=assessFleetDepotOperationalReadiness(raw);
  const counts=safeCounts(raw,prepared,operational);
  try{
    const app=initializeApp({projectId:MOCK_PROJECT},
      'private-proto-local-'+MOCK_PROJECT);
    const db=getFirestore(app);
    const sourceArchive={
      ...raw,revision:1,sealed:false,
      migrationSourceSha256:prepared.sourceSha256
    };
    const sourceBytes=measureDocumentSet(db,SOURCE_PATH,sourceArchive);
    let maxMaster=0,maxClaim=0;
    for(const pair of prepared.pairs){
      maxMaster=Math.max(maxMaster,measureDocumentSet(db,pair.masterPath,pair.master));
      maxClaim=Math.max(maxClaim,measureDocumentSet(db,pair.claimPath,pair.claim));
    }
    // We measured the archive that would actually be written, plus each
    // projected master and immutable claim. No real data was written.
    const docs=1+prepared.pairs.length*2;
    return {
      schema:'imile-v1-offline-firestore-proto-preflight-1',
      ok:true,locallySized:true,localSdkProtoEncodedSizeVerified:true,
      reason:'LOCAL_SDK_PROTO_ONLY_NO_PRODUCTION_TRUST',
      counts,localSourceSha256:prepared.sourceSha256,
      sourceDocumentProtoBytes:sourceBytes,
      maxMasterDocumentProtoBytes:maxMaster,
      maxClaimDocumentProtoBytes:maxClaim,
      measuredDocuments:docs,
      localDocumentProtoLimitBytes:MAX_DOCUMENT_PROTO_BYTES,
      operationallyReady:operational.ready,
      operationalReasons:operational.reasons,
      operationalWarnings:operational.warnings,
      ...importAuth
    };
  }catch{
    return refusal('FIRESTORE_SDK_PROTO_MEASUREMENT_DENIED');
  }
}
function report(result,asJson){
  if(asJson){
    process.stdout.write(JSON.stringify(result,null,2)+'\n');
    return;
  }
  const c=result.counts;
  process.stdout.write([
    'iMile Flotta – helyi Firestore protobuf-méret ellenőrzés',
    'Állapot: '+(result.ok?'HELYI KÓDOLÁSI MÉRÉS SIKERES':'HELYI MÉRÉS ELUTASÍTVA'),
    'Oka: '+result.reason,
    ...(c?[
      'Futárok: '+c.drivers+'; járművek: '+c.vehicles+
        '; tankolókártyák: '+c.fuelCards+'; kapcsolatok: '+c.contacts,
      'Mért forrásarchívum (protobuf bájt): '+result.sourceDocumentProtoBytes,
      'Legnagyobb master (protobuf bájt): '+result.maxMasterDocumentProtoBytes,
      'Legnagyobb claim (protobuf bájt): '+result.maxClaimDocumentProtoBytes,
      'Mért dokumentumok: '+result.measuredDocuments,
      'Kapacitás/Rules helyi készenlét: '+(result.operationallyReady?'IGEN':'NEM'),
      'Kizáró helyi működési okok: '+(result.operationalReasons.join(', ')||'nincs')
    ]:[]),
    'ÉLES IMPORT NEM ENGEDÉLYEZETT: nincs hiteles forrás, IAM/trust-root, éles Apps Script leltár vagy tulajdonosi release GO.'
  ].join('\n')+'\n');
}
export function runPrivateProtoPreflight(args=process.argv.slice(2)){
  const asJson=args.includes('--json');
  const flags=args.filter(s=>s!=='--json');
  if(flags.length!==2||flags[0]!=='--input'||!flags[1]||
     flags[1].startsWith('-')||args.filter(s=>s==='--json').length>1){
    report(refusal('INVALID_ARGUMENTS'),asJson);
    return 1;
  }
  let raw;
  try{
    const stat=statSync(flags[1]);
    if(!stat.isFile()||stat.size<1||stat.size>MAX_INPUT_FILE_BYTES){
      report(refusal('SOURCE_FILE_EMPTY_OR_TOO_LARGE'),asJson);
      return 1;
    }
    raw=JSON.parse(readFileSync(flags[1],'utf8'));
  }catch{
    report(refusal('SOURCE_FILE_UNREADABLE_OR_INVALID_JSON'),asJson);
    return 1;
  }
  const result=measurePrivateRichFleetSource(raw);
  report(result,asJson);
  return result.ok?0:2;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1]))
  process.exitCode=runPrivateProtoPreflight();
