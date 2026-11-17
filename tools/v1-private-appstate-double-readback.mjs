/**
 * iMile Fleet+Depot V1: PRIVATE, OFFLINE owner app-state double-readback check.
 *
 * Accept two independent local copies of Google Sheets _APP_STATE A2:C2 and a
 * separately SAVED full-rich C2 JSON file. No Google, Firestore, network,
 * credentials, signed identity, file writes, backup creation, or deployment.
 *
 * Input rows are either a 3-value JSON array:
 *   [42, "synthetic-request-token", "{\"vehicles\":[],...}"]
 * or a UTF-8 TSV clipboard row copied from A2:C2. Google Sheets TSV quoting
 * of JSON (double-double-quotes) is supported. No real source data in repo.
 *
 * node tools/v1-private-appstate-double-readback.mjs \
 *   --first /private/first.tsv --second /private/second.tsv \
 *   --saved /private/full-original-flotta.json [--json]
 *
 * Passing means only that the two supplied local captures have consistent
 * revision/capture-token/raw JSON and the SAVED C2 bytes are identical. It is NOT
 * proof the captures came from the live authoritative Sheet, that concurrent
 * writers were stopped, or that the source was independently backed up.
 */
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {readStrictPrivateUtf8File} from './v1-private-utf8-read.mjs';
import {assessPrivateFleetExport} from './v1-owner-readiness-cli.mjs';

const MAX_PRIVATE_BYTES=1_200_000;
export const APPSTATE_READBACK_SCHEMA='imile-v1-private-appstate-double-readback-2';

function result(reasons,detail={}){
  return {
    schema:APPSTATE_READBACK_SCHEMA,
    localReadbackAndSavedBytesConsistent:reasons.length===0,
    reasons,
    revisionMatched:false,
    captureTokenMatched:false,
    captureTokenKind:null,
    timestampMatched:false,
    sourceCellBytesMatched:false,
    savedExportBytesMatched:false,
    sourcePreflightOk:false,
    operationallyReady:false,
    counts:null,
    operationalReasons:[],
    operationalWarnings:[],
    ...detail,
    // Never treat a caller-controlled Sheet capture as independent authority.
    actualSheetAuthorityVerified:false,
    freshLiveSourceVerified:false,
    pendingBrowserWritesReconciled:false,
    independentlyPinnedBackupVerified:false,
    restoredBackupVerified:false,
    actualLegacyWriterStopVerified:false,
    productionIamVerified:false,
    authorizedForImport:false,
    productionReleaseApproved:false,
    cloudReadOnly:true,
    privateFilesUnmodified:true
  };
}
function unquoteTsvCell(x){
  if(x.startsWith('"')){
    if(x.length<2||!x.endsWith('"'))throw Error('ROW_INVALID');
    const body=x.slice(1,-1);
    const decoded=body.replaceAll('""','"');
    if(decoded.replaceAll('"','""')!==body)throw Error('ROW_INVALID');
    return decoded;
  }
  return x;
}
export function decodePrivateAppStateRow(text){
  if(typeof text!=='string'||!text||Buffer.byteLength(text,'utf8')>MAX_PRIVATE_BYTES)
    throw Error('ROW_INVALID');
  let row=text.charCodeAt(0)===0xfeff?text.slice(1):text;
  if(row.endsWith('\r\n'))row=row.slice(0,-2);
  else if(row.endsWith('\n'))row=row.slice(0,-1);
  let cells;
  if(row.startsWith('[')){
    cells=JSON.parse(row);
  }else if(row.includes('\t')){
    cells=row.split('\t').map(unquoteTsvCell);
  }else{
    const parsed=JSON.parse(row);
    if(!parsed||typeof parsed!=='object'||Array.isArray(parsed)||
       Object.keys(parsed).sort().join(',')!=='revision,stateJson,updatedAt')
      throw Error('ROW_INVALID');
    cells=[parsed.revision,parsed.updatedAt,parsed.stateJson];
  }
  if(!Array.isArray(cells)||cells.length!==3)throw Error('ROW_INVALID');
  const revisionRaw=cells[0];
  if(typeof revisionRaw!=='number'&&
     (typeof revisionRaw!=='string'||!/^[1-9][0-9]*$/.test(revisionRaw)))
    throw Error('ROW_INVALID');
  const revision=Number(revisionRaw);
  const updatedAt=cells[1],sourceText=cells[2];
  if(!Number.isSafeInteger(revision)||revision<1||
     typeof updatedAt!=='string'||updatedAt.length<8||updatedAt.length>128||
     /[\r\n\t\u0000-\u001f]/.test(updatedAt)||
     typeof sourceText!=='string'||sourceText.length<2||
     Buffer.byteLength(sourceText,'utf8')>MAX_PRIVATE_BYTES)
    throw Error('ROW_INVALID');
  const source=JSON.parse(sourceText);
  if(!source||typeof source!=='object'||Array.isArray(source))
    throw Error('ROW_INVALID');
  // updatedAt is retained only as a legacy input alias. Column B is an
  // opaque Request ID in the actual source; it never establishes freshness.
  return {revision,captureToken:updatedAt,updatedAt,sourceText,source};
}

export function assessPrivateAppStateReadbacks(firstText,secondText,savedExportText){
  let a,b;
  try{a=decodePrivateAppStateRow(firstText);}
  catch{return result(['FIRST_APPSTATE_CAPTURE_INVALID']);}
  try{b=decodePrivateAppStateRow(secondText);}
  catch{return result(['SECOND_APPSTATE_CAPTURE_INVALID']);}
  const revisionMatched=a.revision===b.revision;
  const captureTokenMatched=a.captureToken===b.captureToken;
  const isIso=s=>/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(s)&&
    Number.isFinite(Date.parse(s))&&new Date(Date.parse(s)).toISOString()===s;
  const bothIso=isIso(a.captureToken)&&isIso(b.captureToken);
  const captureTokenKind=bothIso?'iso-timestamp-text':'opaque';
  const timestampMatched=bothIso&&captureTokenMatched;
  const sourceCellBytesMatched=a.sourceText===b.sourceText;
  const savedExportBytesMatched=typeof savedExportText==='string'&&
    savedExportText===a.sourceText;
  const reasons=[];
  if(!revisionMatched)reasons.push('REVISION_CHANGED_BETWEEN_READS');
  if(!captureTokenMatched){
    reasons.push('CAPTURE_TOKEN_CHANGED_BETWEEN_READS');
    if(bothIso)reasons.push('TIMESTAMP_CHANGED_BETWEEN_READS');
  }
  if(!sourceCellBytesMatched)reasons.push('SOURCE_CELL_CHANGED_BETWEEN_READS');
  if(!savedExportBytesMatched)reasons.push('SAVED_SOURCE_NOT_BYTE_IDENTICAL');
  let preflight=null;
  try{preflight=assessPrivateFleetExport(a.source);}
  catch{reasons.push('FULL_RICH_SOURCE_PREFLIGHT_ERROR');}
  if(preflight&&!preflight.sourcePreflightOk)
    reasons.push('FULL_RICH_SOURCE_PREFLIGHT_DENIED');
  return result(reasons,{
    localReadbackAndSavedBytesConsistent:reasons.length===0,
    revisionMatched,captureTokenMatched,captureTokenKind,timestampMatched,sourceCellBytesMatched,
    savedExportBytesMatched,
    sourcePreflightOk:preflight?.sourcePreflightOk===true,
    operationallyReady:preflight?.operationallyReady===true,
    counts:preflight?.counts||null,
    operationalReasons:preflight?.reasons||[],
    operationalWarnings:preflight?.warnings||[]
  });
}
function readPrivate(path){
  // One read-only, O_NOFOLLOW, exact-fd/size UTF-8 check shared with the
  // other private Fleet tools. Never accept a symlink changed after lstat.
  return readStrictPrivateUtf8File(path,MAX_PRIVATE_BYTES);
}
export function runPrivateAppStateReadback(argv=process.argv.slice(2)){
  const json=argv.includes('--json');
  const args=argv.filter(x=>x!=='--json');
  const flags={};
  if(argv.filter(x=>x==='--json').length>1||args.length!==6){
    output(result(['INVALID_ARGUMENTS']),json);return 1;
  }
  for(let i=0;i<args.length;i+=2){
    const flag=args[i],value=args[i+1];
    if(!['--first','--second','--saved'].includes(flag)||
       Object.hasOwn(flags,flag)||!value||value.startsWith('-')){
      output(result(['INVALID_ARGUMENTS']),json);return 1;
    }
    flags[flag]=value;
  }
  if(!flags['--first']||!flags['--second']||!flags['--saved']){
    output(result(['INVALID_ARGUMENTS']),json);return 1;
  }
  let one,two,saved;
  try{one=readPrivate(flags['--first']);}
  catch{output(result(['FIRST_PRIVATE_FILE_UNREADABLE_OR_INVALID']),json);return 1;}
  try{two=readPrivate(flags['--second']);}
  catch{output(result(['SECOND_PRIVATE_FILE_UNREADABLE_OR_INVALID']),json);return 1;}
  try{saved=readPrivate(flags['--saved']);}
  catch{output(result(['SAVED_PRIVATE_FILE_UNREADABLE_OR_INVALID']),json);return 1;}
  const report=assessPrivateAppStateReadbacks(one,two,saved);
  output(report,json);
  return report.localReadbackAndSavedBytesConsistent?0:2;
}
function output(r,json){
  if(json){process.stdout.write(JSON.stringify(r,null,2)+'\n');return;}
  process.stdout.write([
    'iMile Flotta – PRIVÁT dupla _APP_STATE kiolvasás + mentett C2 fájl',
    'Két kiolvasás és a fájl egyezése: '+
      (r.localReadbackAndSavedBytesConsistent?'HELYI EGYEZÉS':'ELUTASÍTVA'),
    'Verzió egyezik: '+(r.revisionMatched?'IGEN':'NEM'),
    'Második cella (kérésazonosító/token) egyezik: '+(r.captureTokenMatched?'IGEN':'NEM'),
    'Második cella típusa: '+(r.captureTokenKind==='iso-timestamp-text'?'ISO dátumszöveg, nem hiteles frissesség':'Nem időbélyeg, átlátszatlan token'),
    'Teljes JSON karakterhűen egyezik: '+(r.sourceCellBytesMatched?'IGEN':'NEM'),
    'A mentett fájl byte-pontosan egyezik: '+(r.savedExportBytesMatched?'IGEN':'NEM'),
    'Aktív futárkapacitások rendben: '+(r.operationallyReady?'IGEN':'NEM'),
    'Helyi hibák: '+(r.reasons.join(', ')||'nincs'),
    'TOVÁBBI STOP: önálló hiteles forráspin, böngészős pending, Apps Script írók, IAM, tényleges visszaállítás és owner release jóváhagyás külön igazolandó.'
  ].join('\n')+'\n');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))
  process.exitCode=runPrivateAppStateReadback();
