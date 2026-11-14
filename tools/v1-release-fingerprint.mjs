/**
 * Source-level SHA-256 release evidence for a single Git HEAD.
 *
 * READ-ONLY. It is NOT the deployed web artifact SHA, a Firebase Rules
 * deployment attestation, IAM verification, or anyone's GO. A signed final
 * release still needs both independent audits and explicit owner approval.
 */
import {createHash} from 'node:crypto';
import {readFileSync,lstatSync} from 'node:fs';
import {relative,resolve,isAbsolute,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';

const ROOT=resolve(fileURLToPath(new URL('../',import.meta.url)));
export const SOURCE_FILES=Object.freeze([
  {role:'original-fleet-html',path:'index.html'},
  {role:'original-fleet-firestore-bridge',path:'features/firestore-bridge.js'},
  {role:'depot-desktop-html',path:'depokapacitas/index.html'},
  {role:'depot-operations-app',path:'depokapacitas/app.js'},
  {role:'restricted-firestore-rules',path:'depokapacitas/firestore-v1-restricted.rules'},
  {role:'migration-four-block-planner',path:'tools/v1-variable-block-migration.mjs'},
  {role:'migration-readiness-preflight',path:'features/v1-fleet-source-remediation.mjs'},
  {role:'private-source-cli',path:'tools/v1-fleet-remediation-cli.mjs'},
  {role:'source-fingerprint-generator',path:'tools/v1-release-fingerprint.mjs'},
  {role:'reports-business-contract',path:'staging/imile-management/reports/REPORTS_AND_STATS_SPEC_HU.md'},
  {role:'in-hub-ofd-report-workbench',path:'staging/imile-management/reports/report-app.mjs'},
  {role:'in-hub-ofd-report-calculation',path:'staging/imile-management/reports/report-core.mjs'},
  {role:'report-desktop-html',path:'staging/imile-management/reports/index.html'},
  {role:'report-xlsx-read-write',path:'staging/imile-management/reports/xlsx-lite.mjs'},
  {role:'report-ofd-statistics',path:'staging/imile-management/reports/report-statistics.mjs'},
  {role:'report-inventory-statistics',path:'staging/imile-management/reports/inventory-statistics.mjs'},
  {role:'shared-session-policy',path:'staging/imile-management/session-policy.mjs'},
  {role:'depot-firebase-public-config',path:'depokapacitas/firebase-config.js'},
  {role:'reports-two-browser-acceptance',path:'staging/imile-management/fleet/v1-reports-two-browser.e2e.mjs'},
  {role:'ofd-save-two-browser-acceptance',path:'staging/imile-management/fleet/v1-ofd-save-two-browser.e2e.mjs'}
]);
const SHA40=/^[a-f0-9]{40}$/;
const sha256=v=>createHash('sha256').update(v).digest('hex');
function checkedPath(root,path){
  if(typeof path!=='string'||!path||isAbsolute(path)||
     path.includes('\\')||path.split('/').some(x=>!x||x==='.'||x==='..'))
    throw Error('INVALID_SOURCE_RELATIVE_PATH');
  const full=resolve(root,path);
  const rel=relative(root,full);
  if(!rel||rel==='..'||rel.startsWith('..'+sep)||isAbsolute(rel))
    throw Error('SOURCE_OUTSIDE_REPOSITORY');
  const st=lstatSync(full);
  if(!st.isFile()||st.isSymbolicLink())
    throw Error('RELEASE_SOURCE_NOT_REGULAR_FILE');
  return full;
}
export function fingerprintSources({
  root,commitSha,items=SOURCE_FILES
}={}){
  if(typeof root!=='string'||!root||!SHA40.test(commitSha||'')||
     !Array.isArray(items)||items.length===0)
    throw Error('EXACT_COMMIT_AND_FILES_REQUIRED');
  const roles=new Set(),paths=new Set();
  const files=items.map(item=>{
    if(!item||typeof item.role!=='string'||!item.role||
       !/^[a-z0-9-]+$/.test(item.role)||roles.has(item.role)||
       paths.has(item.path))throw Error('DUPLICATE_OR_INVALID_SOURCE_ENTRY');
    roles.add(item.role);paths.add(item.path);
    const bytes=readFileSync(checkedPath(root,item.path));
    return {role:item.role,path:item.path,bytes:bytes.length,sha256:sha256(bytes)};
  }).sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
  const evidence=JSON.stringify({commitSha,files});
  return {
    evidenceType:'V1_READ_ONLY_SOURCE_FINGERPRINT_NOT_DEPLOY_ATTESTATION',
    commitSha,sourceBundleSha256:sha256(Buffer.from(evidence,'utf8')),
    files,artifactDeployed:false,productionIamVerified:false,
    independentGrokFullGo:false,independentChatGptFullGo:false,
    ownerReleaseApproved:false,productionReleaseAuthorized:false
  };
}
function git(...args){
  return execFileSync('git',args,{cwd:ROOT,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
}
function cli(){
  try{
    const head=git('rev-parse','HEAD');
    if(git('status','--porcelain','--untracked-files=no'))
      throw Error('DIRTY_TRACKED_CHECKOUT');
    const report=fingerprintSources({root:ROOT,commitSha:head});
    console.log(JSON.stringify(report));
  }catch(e){
    // Fail without accidentally displaying filesystem paths, environment
    // variables or source contents in CI logs.
    console.error('V1_SOURCE_FINGERPRINT_DENIED: '+
      (String(e.message||e).startsWith('DIRTY')?'DIRTY_TRACKED_CHECKOUT':
        'INVALID_OR_MISSING_EXACT_HEAD_SOURCE'));
    process.exitCode=2;
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
  cli();
