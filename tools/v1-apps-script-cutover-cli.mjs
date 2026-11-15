/**
 * Read-only local owner-supplied, REDACTED legacy Apps Script inventory check.
 * node tools/v1-apps-script-cutover-cli.mjs --input /private/sanitized-inventory.json
 * Nothing is uploaded, written or connected to Google/Firebase.
 */
import {readFileSync,statSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {assessAppsScriptCutoverEvidence,CUTOVER_SCHEMA}
  from './v1-apps-script-cutover-evidence.mjs';
const FILE_LIMIT=256*1024;
const refusal=reason=>({
  schema:CUTOVER_SCHEMA,locallyComplete:false,noActiveFleetWriterClaimed:false,
  reasons:[reason],counts:null,ownerEvidenceAuthenticated:false,
  liveDeploymentVerified:false,productionCutoverAuthorized:false,
  authorizedForImport:false,readOnly:true
});
function print(res,json){
  if(json){
    process.stdout.write(JSON.stringify(res,null,2)+'\n');
    return;
  }
  const c=res.counts;
  process.stdout.write([
    'iMile — régi Apps Script adatírók helyi ellenőrzése',
    'Állapot: '+(res.locallyComplete?'HELYI NYILVÁNTARTÁS TELJES':'NINCS ELÉG ELLENŐRZÖTT ADAT'),
    ...(c?[
      'Projektek: '+c.projects+'; telepítések: '+c.deployments+
      '; triggerek: '+c.triggers,
      'Aktív, adatot írni képes elemek: '+c.activeFleetWriters,
      'Ismeretlen állapotú elemek: '+c.unknownStatus
    ]:[]),
    'Hiányok/akadályok: '+(res.reasons.join(', ')||'nincs helyi nyilvántartási akadály'),
    'ÉLES ÁTKAPCSOLÁS: TILTVA. Az üzemelő Google-telepítések ellenőrzése és a külön tulajdonosi engedély HIÁNYZIK.'
  ].join('\n')+'\n');
}
export function runLocalAppsScriptCutover(argv=process.argv.slice(2)){
  const json=argv.includes('--json'),args=argv.filter(s=>s!=='--json');
  if(args.length!==2||args[0]!=='--input'||typeof args[1]!=='string'||
     args[1].startsWith('-')||argv.filter(s=>s==='--json').length>1){
    print(refusal('INVALID_ARGUMENTS'),json);return 1;
  }
  let text;
  try{
    const size=statSync(args[1]).size;
    if(!Number.isSafeInteger(size)||size===0||size>FILE_LIMIT){
      print(refusal('EMPTY_OR_OVERSIZE_MANIFEST'),json);return 1;
    }
    text=readFileSync(args[1],'utf8');
  }catch{
    print(refusal('MANIFEST_FILE_UNREADABLE'),json);return 1;
  }
  let source;
  try{source=JSON.parse(text)}
  catch{
    print(refusal('INVALID_MANIFEST_JSON'),json);return 1;
  }
  let verdict;
  try{verdict=assessAppsScriptCutoverEvidence(source)}
  catch{
    // Never expose owner file path, endpoint, script ID, token or stack trace.
    print(refusal('LOCAL_MANIFEST_CHECK_FAILED'),json);return 1;
  }
  print(verdict,json);
  return verdict.locallyComplete?0:2;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1]))
  process.exitCode=runLocalAppsScriptCutover();
