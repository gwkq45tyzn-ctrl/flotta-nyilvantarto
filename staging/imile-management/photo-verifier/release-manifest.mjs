// Immutable Git objects + deterministic web artifact inventory. No cloud calls.
import {execFileSync,spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {resolve,relative,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
export const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
export const BASELINE='fbf5a04a0537f3525d72f9a7029f7a3e2bc1ee8a';
const DIR='staging/imile-management/photo-verifier/';
export const GENERATED_INDEX='<!doctype html><html lang="hu"><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><title>iMile staging</title><meta http-equiv="refresh" content="0;url=./staging/imile-management/index.html"><a href="./staging/imile-management/index.html">Közös bejelentkezés</a></html>\n';
export const GENERATED_CONFIG={hosting:{public:'.',ignore:['firebase.json','**/.*','**/node_modules/**','**/*.log','**/*.log.*'],headers:[{source:'**',headers:[{key:'Cache-Control',value:'no-store'},{key:'X-Content-Type-Options',value:'nosniff'}]}]}};
const git=(...args)=>execFileSync('git',args,{cwd:ROOT,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
export const digest=value=>createHash('sha256').update(value).digest('hex');
const source=(sha,path)=>execFileSync('git',['show',sha+':'+path],{cwd:ROOT});
const cache=new Map();
const trees=new Map();
function tree(sha){
 if(!trees.has(sha)){
  const rows=execFileSync('git',['ls-tree','-r','-z',sha],{cwd:ROOT,encoding:'utf8'}).split('\0').filter(Boolean);
  trees.set(sha,new Map(rows.map(row=>{const [metadata,path]=row.split('\t');return [path,metadata.split(' ')[2]];})));
 }
 return trees.get(sha);
}
const entry=(sha,path)=>({path,gitBlob:tree(sha).get(path),sha256:digest(source(sha,path))});
function ancestor(a,b){const r=spawnSync('git',['merge-base','--is-ancestor',a,b],{cwd:ROOT});if(r.status>1)throw Error('DEPENDENCY_OBJECT_MISSING');return r.status===0;}
export function chainSnapshot(){return JSON.parse(readFileSync(join(ROOT,DIR,'release-pr-chain.json'),'utf8'));}
export function fetchDependencies(){
 const chain=chainSnapshot(),heads=[...new Set([...chain.stack,...chain.integratedSidePRs].map(p=>p.head))];
 if(!heads.every(s=>/^[a-f0-9]{40}$/.test(s)))throw Error('INVALID_DEPENDENCY_SHA');
 execFileSync('git',['fetch','--no-tags','origin',...heads],{cwd:ROOT,stdio:'pipe'});
}
export function makeManifest(ref='HEAD'){
 if(ref!=='HEAD'&&!/^[a-f0-9]{40}$/.test(ref))throw Error('EXACT_COMMIT_REQUIRED');
 const sha=git('rev-parse',ref+'^{commit}');if(!ancestor(BASELINE,sha))throw Error('BASELINE_NOT_INCLUDED');
 if(cache.has(sha))return structuredClone(cache.get(sha));
 const build=source(sha,'staging/imile-management/build-preview.mjs').toString();
 const block=build.match(/const allowed=\[([\s\S]*?)\];/);if(!block)throw Error('BUILD_ALLOWLIST_MISSING');
 const web=[...block[1].matchAll(/'([^']+)'/g)].map(m=>m[1]);
 if(web.some(p=>!p.startsWith('staging/imile-management/')&&!p.startsWith('depokapacitas/'))||new Set(web).size!==web.length)throw Error('UNSAFE_WEB_ALLOWLIST');
 const components={
  firestore:['depokapacitas/firestore.rules'],
  storage:['staging/imile-management/attendance/storage.rules'],
  functions:['index.mjs','verifier.mjs','adapters.mjs','quota-callable.mjs','quota-service.mjs','quota-policy.mjs','app-check.mjs','call-limits.mjs','package.json','package-lock.json'].map(p=>DIR+p),
  pwa:web.filter(p=>p.includes('/attendance/')),
  depo:web.filter(p=>p.startsWith('depokapacitas/')),
  managementFleetReports:web.filter(p=>!p.includes('/attendance/')&&!p.startsWith('depokapacitas/')),
  buildAndCI:['staging/imile-management/build-preview.mjs','.github/workflows/imile-staging.yml','firebase.photo-quota-emulator.json']
 };
 const hashes=Object.fromEntries(Object.entries(components).map(([group,paths])=>[group,paths.sort().map(p=>entry(sha,p))]));
 const chain=JSON.parse(source(sha,DIR+'release-pr-chain.json').toString());
 const dependencies=[...chain.stack,...chain.integratedSidePRs].map(p=>{
  const included=ancestor(p.head,sha);
  const changed=git('diff','--name-only',p.base+'...'+p.head).split('\n').filter(Boolean);
  const paths=changed.map(path=>({path,headBlob:tree(p.head).get(path)||null,releaseBlob:tree(sha).get(path)||null}));
  return {...p,ancestor:included,relationship:included?'ANCESTOR':'INTEGRATED_OR_SUPERSEDED_REQUIRES_FEATURE_EVIDENCE',paths};
 });
 const manifest={schemaVersion:1,repository:chain.repository,sourceCommit:sha,gitTree:git('rev-parse',sha+'^{tree}'),baseline:BASELINE,
  project:'imile-management-staging',region:'europe-west3',hostingChannel:'imile-qa',bucket:'imile-management-staging.firebasestorage.app',
  deploymentAuthorized:false,cloudDecision:'NO-GO',components:hashes,dependencies,webPaths:web.sort(),
  policySequence:{bootstrap:{revision:1,enabled:false},activation:{expectedRevision:1,revision:2,enabled:true},rollback:'never lower revision; STOP and restore use new monotonically increasing revisions'},
  functions:{attendancePhotoPermit:{boundary:'Auth + App Check',identity:'attendance-photo-quota',maxInstances:2,concurrency:10},attendancePhotoFinalized:{boundary:'private storage event',identity:'attendance-photo-verifier',maxInstances:2,concurrency:1},attendancePhotoDeleted:{boundary:'private storage event',identity:'attendance-photo-verifier',maxInstances:2,concurrency:1},attendancePhotoMetadata:{boundary:'private storage event',identity:'attendance-photo-verifier',maxInstances:2,concurrency:1}},
  featureEvidence:entry(sha,DIR+'RELEASE_READINESS.hu.md'),artifactIncludesNoData:true,cloudIAMProof:false};
 cache.set(sha,manifest);return structuredClone(manifest);
}
export function verifyManifest(manifest){
 if(manifest?.schemaVersion!==1||manifest.project!=='imile-management-staging'||manifest.hostingChannel!=='imile-qa'||manifest.deploymentAuthorized!==false)throw Error('INVALID_RELEASE_TARGET');
 const expected=makeManifest(manifest.sourceCommit);
 if(JSON.stringify(expected)!==JSON.stringify(manifest))throw Error('MANIFEST_MISMATCH');
 return true;
}
export function verifyBundle(manifest,bundleDir){
 const found=[];function walk(dir){for(const e of readdirSync(dir,{withFileTypes:true})){const p=join(dir,e.name);if(e.isSymbolicLink())throw Error('BUNDLE_SYMLINK');if(e.isDirectory())walk(p);else found.push(relative(bundleDir,p).replaceAll('\\','/'));}}walk(bundleDir);
 const allowed=[...manifest.webPaths,'index.html','firebase.json'].sort();if(JSON.stringify(found.sort())!==JSON.stringify(allowed))throw Error('BUNDLE_FILE_SET_MISMATCH');
 const entries=Object.values(manifest.components).flat();
 if(readFileSync(join(bundleDir,'index.html'),'utf8').replaceAll('\r\n','\n')!==GENERATED_INDEX||
 JSON.stringify(JSON.parse(readFileSync(join(bundleDir,'firebase.json'),'utf8')))!==JSON.stringify(GENERATED_CONFIG))throw Error('GENERATED_BOOTSTRAP_MISMATCH');
 for(const p of manifest.webPaths){const actual=readFileSync(join(bundleDir,p),'utf8').replaceAll('\r\n','\n');if(digest(actual)!==entries.find(e=>e.path===p)?.sha256)throw Error('BUNDLE_CONTENT_MISMATCH '+p);}
 // The two generated files are derived from the pinned builder in an empty
 // directory. Their exact hashes are recorded, not treated as authored inputs.
 return found.map(path=>({path,sha256:digest(readFileSync(join(bundleDir,path),'utf8').replaceAll('\r\n','\n'))}));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv.includes('--fetch-dependencies'))fetchDependencies();
 else if(process.argv[2]==='--verify'){
  const artifact=JSON.parse(readFileSync(process.argv[3],'utf8'));verifyManifest(artifact.manifest);
  const files=verifyBundle(artifact.manifest,join(ROOT,'preview-imile-staging'));
  if(JSON.stringify(files)!==JSON.stringify(artifact.webArtifact.files)||digest(JSON.stringify(files))!==artifact.webArtifact.inventorySha256)throw Error('ARTIFACT_INVENTORY_MISMATCH');
  console.log('RELEASE_MANIFEST_VERIFIED');
 }
 else{
  const output=process.argv[2];if(!output)throw Error('OUTPUT_REQUIRED');
  const manifest=makeManifest();verifyManifest(manifest);
  const bundle=verifyBundle(manifest,join(ROOT,'preview-imile-staging'));
  writeFileSync(output,JSON.stringify({manifest,webArtifact:{files:bundle,inventorySha256:digest(JSON.stringify(bundle))}},null,2)+'\n');
  console.log(JSON.stringify({commit:manifest.sourceCommit,components:Object.values(manifest.components).flat().length,webFiles:bundle.length,decision:manifest.cloudDecision}));
 }
}
