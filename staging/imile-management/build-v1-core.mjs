/**
 * OFFLINE-ONLY Core V1 review bundle (NOT a deployment / release tool).
 * Makes an auditable source snapshot with FULL original root Fleet index.html
 * and core Depot, while excluding reports/PWA/prototype Fleet and all secrets.
 * No network, Firebase, publish, IAM, mutation of user data or external APIs.
 *
 * Usage: node staging/imile-management/build-v1-core.mjs
 * The resulting folder is a QA artifact, NEVER a production web package:
 * the shared UID, backup/rollback, legacy Apps Script hard-stop and live
 * cloud integration have NOT been approved.
 */
import {cpSync,existsSync,mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {dirname,resolve,join,relative,sep,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const target=join(root,'candidate-imile-v1-core');
const seeds=[
  'index.html',                        // Original Fleet: do NOT substitute prototype
  'features/firestore-bridge.js',
  'features/in-use-vehicles-v23.js',
  'features/active-driver-assignment-v25.js',
  'features/wide-layout-v24.js',
  'features/vehicle-groups-v27.js',
  'staging/imile-management/index.html',
  'staging/imile-management/app.mjs',
  'staging/imile-management/cutover.html',
  'staging/imile-management/cutover-app.mjs',
  'depokapacitas/index.html',
  'depokapacitas/style.css',
  'depokapacitas/app.js',
  'depokapacitas/firebase-config.js',
  'depokapacitas/parcel-preview.html',
  'depokapacitas/parcel-preview.css',
  'depokapacitas/parcel-preview-app.mjs'
];
const deny=p=>/(^|\/)(?:reports|qa|attendance|courier|photo|node_modules)(?:\/|$)/i.test(p)
  || /\.(?:gs|xlsx?|csv|env|pem|key|p12)$/i.test(p)
  || /(^|\/)(?:firebase-admin|service-account|credentials|private[-_]backup)(?:\/|$)/i.test(p)
  || /(^|\/)fleet\/(?:index\.html|operations(?:\.html|\.css|-app\.mjs|-store\.mjs)|master(?:-data|-editor)?\.mjs|app\.mjs|availability\.mjs)/i.test(p);
const queue=[...seeds],included=new Map();
function safePath(source,reference){
  if(!reference.startsWith('.')) return null;  // CDN or bare import
  const absolute=resolve(root,dirname(source),reference.split(/[?#]/)[0]);
  if(absolute!==root&&!absolute.startsWith(root+sep))
    throw Error('Source traversal forbidden: '+reference);
  const result=relative(root,absolute).replaceAll('\\','/');
  if(deny(result))throw Error('Excluded feature imported by core: '+result);
  if(!/\.(?:html|js|mjs|css|json)$/i.test(result))
    throw Error('Unexpected local dependency: '+result);
  return result;
}
function references(source,contents){
  const out=[];
  if(/\.(?:js|mjs)$/.test(source)){
    const staticImport=/^\s*(?:import|export)\s+(?:[^'"\n]+?\s+from\s*)?['"]([^'"]+)['"]/gm;
    const dynamicImport=/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    for(const re of [staticImport,dynamicImport])
      for(const hit of contents.matchAll(re))out.push(hit[1]);
  }
  if(source.endsWith('.html')){
    const assets=/<(?:script|link)\b[^>]*?\b(?:src|href)=['"]([^'"]+)['"][^>]*>/gi;
    for(const hit of contents.matchAll(assets))out.push(hit[1]);
  }
  return out;
}
if(existsSync(target))throw Error('Candidate output already exists; refuse overwrite: '+target);
while(queue.length){
  const file=queue.shift();
  if(included.has(file))continue;
  if(deny(file))throw Error('Forbidden candidate seed: '+file);
  const full=join(root,file);
  if(!existsSync(full))throw Error('Missing required core dependency: '+file);
  const bytes=readFileSync(full),text=bytes.toString('utf8');
  included.set(file,createHash('sha256').update(bytes).digest('hex'));
  for(const src of references(file,text)){
    const next=safePath(file,src);
    if(next&&!included.has(next))queue.push(next);
  }
}
mkdirSync(target,{recursive:true});
try{
  for(const file of included.keys()){
    const dest=join(target,file);
    mkdirSync(dirname(dest),{recursive:true});
    cpSync(join(root,file),dest);
  }
  // Preserve original Fleet index.html EXACTLY, including its data model/UX.
  const old=readFileSync(join(root,'index.html'));
  const fleet=readFileSync(join(target,'index.html'));
  if(!old.equals(fleet))throw Error('Original Fleet entry must be byte-for-byte identical');

  // Transform only the candidate's unified hub, NOT the repository source.
  const hub=join(target,'staging/imile-management/index.html');
  let html=readFileSync(hub,'utf8');
  const reports=/<article class="card module reports">[\s\S]*?<\/article>/;
  if(!reports.test(html))throw Error('Report module scope anchor changed');
  html=html.replace(reports,'<!-- OFD + In-Hub excluded from V1; V1.1 only -->');
  html=html.replace(
    /<a class="action secondary" href="\.\/fleet\/operations\.html" id="fleetMasterLink">[^<]*<\/a>/,
    '<span id="fleetMasterLink" hidden aria-hidden="true"></span>');
  html=html.replace('az In-Hub/OFD riportkészítő','a szűkített Flotta + Depó V1 ellenőrző csomag');
  if(html.includes('href="./reports/index.html"')||html.includes('href="./fleet/operations.html"'))
    throw Error('Deferred report/prototype link leaked into candidate');
  writeFileSync(hub,html);
  // The original hub JS still refers to fleetMasterLink; inert span exists.
  const module=join(target,'staging/imile-management/app.mjs');
  let app=readFileSync(module,'utf8');
  app=app.replace(
    "$('fleetMasterLink').hidden=!entries.some(x=>x.id==='fleet'&&x.enabled);",
    "$('fleetMasterLink').hidden=true; // Prototype unavailable in narrowed V1");
  writeFileSync(module,app);

  // Fleet warning schemas are a PURE helper imported by the shared alert
  // aggregator, not the prototype's UI. Retain the helper but point alert
  // actions back at the full original Fleet, never a prototype link.
  const alertsFile=join(target,'staging/imile-management/central-alerts.mjs');
  let alerts=readFileSync(alertsFile,'utf8');
  const prototypeTarget="actionUrl:'../staging/imile-management/fleet/operations.html'";
  if(!alerts.includes(prototypeTarget))throw Error('Fleet alert target changed: re-review required');
  alerts=alerts.replace(prototypeTarget,"actionUrl:'../index.html'");
  writeFileSync(alertsFile,alerts);

  // Hide deferred *views* in the core Depot navigation only. The V1 runner is
  // not an authorization substitute: actual Firestore Rules must deny PWA.
  const depot=join(target,'depokapacitas/index.html');
  let depotHtml=readFileSync(depot,'utf8');
  for(const view of ['results','attendance']){
    const re=new RegExp('<button class="nav-item" data-view="'+view+'">[^<]*(?:<span>[^<]+<\\/span>)?<\\/button>');
    depotHtml=depotHtml.replace(re,'<!-- '+view+' deferred to V1.1 -->');
  }
  writeFileSync(depot,depotHtml);

  // This intentionally is NOT an approved release manifest and cannot be
  // mistaken for a signed deployment permission.
  writeFileSync(join(target,'V1_QA_ONLY_NO_RELEASE.json'),JSON.stringify({
    status:'BLOCKED',purpose:'OFFLINE REVIEW ARTIFACT ONLY – NOT DEPLOYABLE',
    originalFleetSha256:included.get('index.html'),
    componentScope:['original-fleet','core-depot','shared-auth-frontend'],
    excluded:['OFD','In-Hub','reporting','Attendance PWA','courier','photo','Fleet prototype'],
    files:[...included.keys()].sort(),
    liveAuthVerified:false,liveRulesVerified:false,liveBackupVerified:false,
    liveTwoPcVerified:false,migrationAuthorized:false,ownerReleaseApproved:false
  },null,2)+'\n');
  console.log('PASS: V1 core source-only review artifact; original Fleet hash '+included.get('index.html'));
  console.log('NO-GO: no Firebase deployment, no live account, no migration or real data');
}catch(error){
  rmSync(target,{recursive:true,force:true});
  throw error;
}
