/**
 * READ-ONLY, LOCAL PRIVATE owner preflight for phase-1 Fleet+Depot.
 *
 * Usage:
 *   node tools/v1-owner-readiness-cli.mjs --input /private/flotta-source.json
 *   node tools/v1-owner-readiness-cli.mjs --input /private/flotta-source.json --json
 *
 * The input must be an EXPORTED, raw full-rich Fleet JSON containing four
 * arrays (vehicles, drivers, fuelCards, contacts). Nothing is uploaded,
 * written, modified, logged or cached. This script never connects to cloud
 * or asserts owner IAM, provenance, signature, independent pin or release GO.
 * It intentionally never prints names, DA IDs, plates, contacts or raw errors.
 */
import {readStrictPrivateUtf8File} from './v1-private-utf8-read.mjs';
import {fileURLToPath} from 'node:url';
import {preflight} from './v1-migration-dryrun.mjs';
import {assessFleetDepotOperationalReadiness} from './v1-operational-readiness.mjs';

const MAX_INPUT_BYTES=1_200_000;
const HELP='Használat: node tools/v1-owner-readiness-cli.mjs --input /privát/flotta.json [--json]';
const refuse=reason=>({
  schema:'imile-v1-local-operational-preflight-1',
  operationallyReady:false,sourcePreflightOk:false,
  reasons:[reason],warnings:[],
  authorizedForImport:false,ownerApprovalVerified:false,
  productionIamVerified:false,firestoreEncodedSizeVerified:false,
  independentSourcePinVerified:false,readOnly:true,
  counts:null,untrustedLocalSourceSha256:null
});

export function assessPrivateFleetExport(raw){
  const source=preflight(raw);
  const operational=assessFleetDepotOperationalReadiness(raw);
  const sourceError=source.ok?[]:['FULL_RICH_SOURCE_PREFLIGHT_DENIED'];
  const reasons=[...sourceError,...operational.reasons];
  const counts={
    ...operational.counts,
    fuelCards:Array.isArray(raw?.fuelCards)?raw.fuelCards.length:0,
    contacts:Array.isArray(raw?.contacts)?raw.contacts.length:0
  };
  return {
    schema:'imile-v1-local-operational-preflight-1',
    operationallyReady:reasons.length===0,
    sourcePreflightOk:source.ok,
    reasons,warnings:operational.warnings,counts,
    // This digest is calculated locally from caller-supplied bytes.
    // It is not an external trust-root, signed manifest or owner approval.
    untrustedLocalSourceSha256:source.ok?source.sourceSha256:null,
    authorizedForImport:false,ownerApprovalVerified:false,
    productionIamVerified:false,firestoreEncodedSizeVerified:false,
    independentSourcePinVerified:false,readOnly:true
  };
}
function report(result,json){
  if(json){
    process.stdout.write(JSON.stringify(result,null,2)+'\n');
    return;
  }
  const c=result.counts;
  process.stdout.write([
    'iMile Flotta + Depó — PRIVÁT, CSAK OLVASÁSI ELŐELLENŐRZÉS',
    'Állapot: '+(result.operationallyReady?'HELYI ADATELLENŐRZÉS RENDBEN':'ELŐKÉSZÍTÉS SZÜKSÉGES'),
    ...(c?[
      'Futárok: '+c.drivers+'; aktív: '+c.activeDrivers+
        '; hiányos aktív kapacitás: '+c.activeWithoutCapacity,
      'Járművek: '+c.vehicles+'; aktív: '+c.activeVehicles,
      'Tankolókártyák: '+c.fuelCards+'; kapcsolatok: '+c.contacts,
      'Migrációs ellenőrzés: '+c.keyedPairs+' pár, '+
        c.ownedReadDocuments+'/'+c.maxAtomicOwnedReadDocuments+
        ' dokumentum; helyi migrációs korláton belül: '+
        (c.withinAtomicReadBound?'IGEN':'NEM'),
      'Bizonytalan futárstátusz: '+c.uncertainDriverStatuses
    ]:[]),
    'Akadályok: '+(result.reasons.join(', ')||'nincs helyi adatminőségi akadály'),
    'Figyelmeztetések: '+(result.warnings.join(', ')||'nincs'),
    'ÉLES ADATIMPORT/ÉLESÍTÉS: TILTVA — független mentés, tulajdonosi jóváhagyás és IAM szükséges.'
  ].join('\n')+'\n');
}

export function runOwnerPreflight(argv=process.argv.slice(2)){
  if(argv.length===1&&argv[0]==='--help'){
    process.stdout.write(HELP+'\n');
    return 0;
  }
  const json=argv.includes('--json');
  const args=argv.filter(v=>v!=='--json');
  if(args.length!==2||args[0]!=='--input'||!args[1]||args[1].startsWith('-')||
     argv.filter(v=>v==='--json').length>1){
    report(refuse('INVALID_ARGUMENTS'),json);
    return 1;
  }
  let rawText;
  try{
    rawText=readStrictPrivateUtf8File(args[1],MAX_INPUT_BYTES);
  }catch(e){
    report(refuse(e?.code==='PRIVATE_FILE_SIZE_DENIED'
      ?'INPUT_FILE_EMPTY_OR_TOO_LARGE':'INPUT_FILE_READ_FAILED'),json);
    return 1;
  }
  let source;
  try{source=JSON.parse(rawText)}
  catch{
    report(refuse('INVALID_JSON_FILE'),json);
    return 1;
  }
  let result;
  try{result=assessPrivateFleetExport(source)}
  catch{
    // Never leak private file content, path, DA codes or stack traces.
    report(refuse('PRIVATE_PREFLIGHT_FAILED'),json);
    return 1;
  }
  report(result,json);
  return result.operationallyReady?0:2;
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1])
  process.exitCode=runOwnerPreflight();
