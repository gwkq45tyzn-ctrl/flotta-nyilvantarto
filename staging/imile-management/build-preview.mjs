/**
 * Produce a minimal, isolated Firebase Hosting preview from the staging branch.
 * Never package the legacy Fleet index.html, Google Apps Script or live fleet data.
 * Usage (Node 22): node staging/imile-management/build-preview.mjs
 */
import {cpSync,existsSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve,join,sep} from 'node:path';

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
  // Keep every directly imported Depot module in the allowlist.
  'depokapacitas/keyed-live-master.mjs',
  'depokapacitas/keyed-booking-capacity.mjs',
  'depokapacitas/canonical-booking-transaction.mjs',
  'depokapacitas/canonical-booking-release.mjs',
  'depokapacitas/canonical-booking-gate.mjs',
  'depokapacitas/canonical-source-health.mjs',
  'features/fleet-depo-canonical-transition.mjs',
  'depokapacitas/parcel-preview.html',
  'depokapacitas/parcel-preview.css',
  'depokapacitas/parcel-preview.mjs',
  'depokapacitas/parcel-preview-app.mjs'
];
const packageFiles=coreOnly
  ?allowed.filter(p=>!p.startsWith('staging/imile-management/reports/')
    &&!p.startsWith('staging/imile-management/qa/')
    &&(!p.startsWith('staging/imile-management/fleet/')
      ||p==='staging/imile-management/fleet/operations-data.mjs'))
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
    if(start<0||end<0||safeMenu.indexOf('class="card module reports"',end+'</article>'.length)>=0)
      throw Error('Core-only report link exclusion requires explicit review');
    safeMenu=safeMenu.slice(0,start)+safeMenu.slice(end+'</article>'.length);
    // Hidden links still expose routes; replace both with inert elements.
    const qaAnchor='<a href="./qa/index.html" id="qaLink" hidden>Staging tesztadatok előkészítése</a>';
    const fleetAnchor='<a href="./fleet/operations.html" id="fleetMasterLink" hidden aria-hidden="true" tabindex="-1">Belső prototípus · nem a V1 Flotta</a>';
    if(!safeMenu.includes(qaAnchor)||!safeMenu.includes(fleetAnchor))
      throw Error('Core-only QA/prototype anchors changed: explicit review required');
    safeMenu=safeMenu.replace(qaAnchor,'<span id="qaLink" hidden aria-hidden="true"></span>')
      .replace(fleetAnchor,'<span id="fleetMasterLink" hidden aria-hidden="true"></span>');
    safeMenu=safeMenu.replace(
      'az eredeti Flotta, a fejlett DepóKapacitás és az In-Hub/OFD riportkészítő',
      'az eredeti Flotta és a fejlett DepóKapacitás');
    if(/id="reportsLink"|href="\.\/reports\//.test(safeMenu)||
      packageFiles.some(p=>p.startsWith('staging/imile-management/reports/')))
      throw Error('Core-only build cannot contain report UI or source');
  }
  writeFileSync(menuFile,safeMenu);
  if(coreOnly){
    // Remove live navigation to an intentionally unbundled Fleet prototype.
    const depotFile=join(target,'depokapacitas/app.js');
    const depotSrc=readFileSync(depotFile,'utf8');
    const oldDetail='../staging/imile-management/fleet/operations.html';
    if(!depotSrc.includes(oldDetail))throw Error('Depot Fleet detail link changed: re-review');
    writeFileSync(depotFile,depotSrc.replaceAll(oldDetail,
      '../staging/imile-management/cutover.html')
      .replace('Flotta részletei és a figyelmeztetések forrásrekordjai',
        'Flotta átállási ellenőrzése (staging)'));
    const alertFile=join(target,'staging/imile-management/central-alerts.mjs');
    const alerts=readFileSync(alertFile,'utf8');
    if(!alerts.includes(oldDetail))throw Error('Alert prototype target changed: re-review');
    writeFileSync(alertFile,alerts.replaceAll(oldDetail,
      '../staging/imile-management/cutover.html'));
  }
  // Same hard stop as the offline core bundle: the setup card links a
  // markdown guide that is not copied into either preview.
  const depotHtmlFile=join(target,'depokapacitas/index.html');
  const installHelp='Részletes lépések: <a href="./TELEPITES.md">Telepítési útmutató</a>.';
  const depotHtml=readFileSync(depotHtmlFile,'utf8');
  if(!depotHtml.includes(installHelp))
    throw Error('Depot setup link changed: re-review for preview scope');
  writeFileSync(depotHtmlFile,depotHtml.replace(installHelp,
    'Az éles beállítás kizárólag külön rendszergazdai jóváhagyással történhet.'));
  // Fail closed when a copied file points at a local module, page, or CSS
  // asset that was not packaged. Scheme and bare CDN references are ignored.
  for(const p of packageFiles.filter(p=>/\.(?:mjs|js|html|css)$/.test(p))){
    const source=readFileSync(join(target,p),'utf8');
    const references=[];
    if(/\.(?:mjs|js)$/.test(p)){
      references.push(
        ...[...source.matchAll(/\b(?:import|export)\s+(?:[^'"\n]+?\s+from\s*)?['"](\.[^'"]+)['"]/g)].map(hit=>hit[1]),
        ...[...source.matchAll(/\b(?:import|export)\s*\{[\s\S]*?\}\s*from\s*['"](\.[^'"]+)['"]/g)].map(hit=>hit[1]),
        ...[...source.matchAll(/\bimport\s*\(\s*['"](\.[^'"]+)['"]\s*\)/g)].map(hit=>hit[1])
      );
    }
    if(p.endsWith('.html')){
      references.push(...[...source.matchAll(/\b(?:src|href)=['"](\.[^'"]+)['"]/g)].map(hit=>hit[1]));
    }
    if(p.endsWith('.css')){
      references.push(
        ...[...source.matchAll(/url\(\s*['"]?(\.[^'")\s]+)['"]?\s*\)/g)].map(hit=>hit[1]),
        ...[...source.matchAll(/@import\s+(?:url\(\s*)?['"](\.[^'"]+)['"]/g)].map(hit=>hit[1])
      );
    }
    for(const ref of references){
      const destination=resolve(dirname(join(target,p)),ref.split(/[?#]/)[0]);
      if((destination!==target&&!destination.startsWith(target+sep))||
        !existsSync(destination))
        throw Error('Unbundled local asset '+ref+' referenced by '+p);
    }
  }
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
