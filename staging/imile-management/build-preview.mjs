/**
 * Produce a minimal, isolated Firebase Hosting preview from the staging branch.
 * Never package the legacy Fleet index.html, Google Apps Script or live fleet data.
 * Usage (Node 22): node staging/imile-management/build-preview.mjs
 */
import {cpSync,existsSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve,join} from 'node:path';

const here=dirname(fileURLToPath(import.meta.url));
const root=resolve(here,'../..');
// CORE-only is a staging BUILD PROOF, never a production deployment.
const args=process.argv.slice(2);
if(args.some(x=>x!=='--fleet-depot-only')||args.length>1)
  throw Error('Only --fleet-depot-only is supported');
const coreOnly=args.includes('--fleet-depot-only');
const target=join(root,coreOnly?'preview-imile-fleet-depot':'preview-imile-staging');
const allowed=[
  'staging/imile-management/index.html',
  'staging/imile-management/app.mjs',
  'staging/imile-management/cutover.html',
  'staging/imile-management/cutover-app.mjs',
  'staging/imile-management/core-cutover-preflight.mjs',
  'staging/imile-management/reports/index.html',
  'staging/imile-management/reports/report-app.mjs',
  'staging/imile-management/reports/report-core.mjs',
  'staging/imile-management/reports/xlsx-lite.mjs',
  'staging/imile-management/reports/report-statistics.mjs',
  'staging/imile-management/reports/inventory-statistics.mjs',
  'staging/imile-management/session-policy.mjs',
  'staging/imile-management/attendance-handover.mjs',
  'staging/imile-management/central-alerts.mjs',
  'staging/imile-management/fleet/index.html',
  'staging/imile-management/fleet/app.mjs',
  'staging/imile-management/fleet/availability.mjs',
  'staging/imile-management/fleet/operations.html',
  'staging/imile-management/fleet/operations.css',
  'staging/imile-management/fleet/operations-app.mjs',
  'staging/imile-management/fleet/operations-data.mjs',
  'staging/imile-management/fleet/operations-store.mjs',
  'staging/imile-management/fleet/master-data.mjs',
  'staging/imile-management/fleet/master-editor.mjs',
  'staging/imile-management/qa/index.html',
  'staging/imile-management/qa/app.mjs',
  'staging/imile-management/qa/functional-flow.mjs',
  'staging/imile-management/qa/run-flow.mjs',
  'staging/imile-management/shared-records.mjs',
  'staging/imile-management/shared-import-plan.mjs',
  'depokapacitas/index.html',
  'depokapacitas/style.css',
  'depokapacitas/app.js',
  'depokapacitas/firebase-config.js',
  'depokapacitas/import-dates.mjs',
  'depokapacitas/import-validation.mjs',
  'depokapacitas/import-encoding.mjs',
  'depokapacitas/capacity-eligibility.mjs',
  'depokapacitas/district-capacity.mjs',
  'depokapacitas/next-day-forecast.mjs','depokapacitas/source-health.mjs',
  'depokapacitas/flotta-master-readonly.mjs',
  'depokapacitas/master-reconciliation.mjs',
  'features/shared-master-adapter.mjs',
  'depokapacitas/parcel-preview.html',
  'depokapacitas/parcel-preview.css',
  'depokapacitas/parcel-preview.mjs',
  'depokapacitas/parcel-preview-app.mjs'
];
const packageFiles=coreOnly
  ?allowed.filter(p=>!p.startsWith('staging/imile-management/reports/'))
  :allowed;
for(const p of packageFiles)if(!existsSync(join(root,p)))throw Error('Missing staging file: '+p);
if(existsSync(target))throw Error('Preview directory exists. Remove it manually before rebuilding: '+target);
mkdirSync(target,{recursive:true});
try {
  for(const p of packageFiles) {
    const output=join(target,p);
    mkdirSync(dirname(output),{recursive:true});
    cpSync(join(root,p),output);
  }
  // The isolated hosted QA preview does NOT package the legacy Fleet app.
  // Reroute the unified Fleet card to the safe, read-only cutover screen,
  // instead of sending users into the placeholder root index redirect loop.
  const menuFile=join(target,'staging/imile-management/index.html');
  const menu=readFileSync(menuFile,'utf8');
  if(!menu.includes('href="../../index.html" id="fleetLink"'))
    throw Error('Unified Fleet link changed; preview safety rewrite must be reviewed');
  let safeMenu=menu
    .replace('href="../../index.html" id="fleetLink"','href="./cutover.html" id="fleetLink"')
    .replace('Eredeti Flotta megnyitása','Flotta adatellenőrzés (izolált előnézet)');
  if(coreOnly){
    const start=safeMenu.indexOf('        <article class="card module reports">');
    const end=start<0?-1:safeMenu.indexOf('</article>',start);
    if(start<0||end<0||safeMenu.indexOf('class="card module reports"',start+1)>=0)
      throw Error('Core-only report link exclusion requires explicit review');
    safeMenu=safeMenu.slice(0,start)+safeMenu.slice(end+'</article>'.length);
    safeMenu=safeMenu.replace(
      'az eredeti Flotta, a fejlett DepóKapacitás és az In-Hub/OFD riportkészítő',
      'az eredeti Flotta és a fejlett DepóKapacitás');
    if(/id="reportsLink"|href="\.\/reports\//.test(safeMenu)||
      packageFiles.some(p=>p.startsWith('staging/imile-management/reports/')))
      throw Error('Core-only build cannot contain report UI or source');
  }
  writeFileSync(menuFile,safeMenu);
  writeFileSync(join(target,'index.html'),
    '<!doctype html><html lang="hu"><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><title>iMile staging</title><meta http-equiv="refresh" content="0;url=./staging/imile-management/index.html"><a href="./staging/imile-management/index.html">Közös bejelentkezés</a></html>\n');
  writeFileSync(join(target,'firebase.json'),JSON.stringify({
    hosting:{
      public:'.',
      ignore:['firebase.json','**/.*','**/node_modules/**','**/*.log','**/*.log.*'],
      headers:[{source:'**',headers:[{key:'Cache-Control',value:'no-store'},{key:'X-Content-Type-Options',value:'nosniff'}]}]
    }
  },null,2)+'\n');
  console.log('Safe preview generated: '+target);
  console.log(coreOnly
    ?'CORE-ONLY scoped staging preview: Fleet cutover check + Depot, no OFD/In-Hub/Excel routes/assets; original Fleet still NOT packaged: '+packageFiles.length+' files'
    :'Safe isolated preview: shared hub, advanced Depot, In-Hub/OFD reports and pure original Fleet projection; no legacy Fleet application: '+packageFiles.length+' files');
  console.log('No legacy production Fleet application, no customer data, no Apps Script credentials.');
} catch(error) {
  rmSync(target,{recursive:true,force:true});
  throw error;
}
