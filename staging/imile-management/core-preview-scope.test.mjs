import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {existsSync,readFileSync,readdirSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';

// Strictly isolated local build: never deploy or touch production.
const root=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const builder=join(root,'staging/imile-management/build-preview.mjs');
const output=join(root,'preview-imile-fleet-depot');
const originals=[
 'staging/imile-management/index.html',
 'staging/imile-management/build-preview.mjs'
];
const sourceBefore=originals.map(p=>readFileSync(join(root,p),'utf8'));

test('NARROWED first-release preview excludes all OFD/In-Hub/Excel assets and links',t=>{
 assert.equal(existsSync(output),false,
  'Refuse to delete or overwrite an existing build directory');
 t.after(()=>rmSync(output,{recursive:true,force:true}));
 const result=execFileSync(process.execPath,[builder,'--fleet-depot-only'],
  {cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']});
 assert.match(result,/CORE-ONLY scoped staging preview/);
 const menu=readFileSync(join(output,'staging/imile-management/index.html'),'utf8');
 assert.match(menu,/id="fleetLink"/);
 assert.match(menu,/id="depoLink"/);
 assert.match(menu,/href="\.\/cutover\.html" id="fleetLink"/);
 assert.doesNotMatch(menu,/id="reportsLink"/);
 assert.doesNotMatch(menu,/href="\.\/reports\//);
 assert.doesNotMatch(menu,/class="card module reports"/);
 assert.doesNotMatch(menu,/In-Hub\/OFD riportkészítő/);
 assert.equal(existsSync(join(output,'staging/imile-management/reports')),false);
 assert.equal(existsSync(join(output,'staging/imile-management/qa')),false,
   'No direct-access staging QA route in first release preview');
 assert.equal(existsSync(join(output,'staging/imile-management/fleet/operations.html')),false,
   'No Fleet replacement prototype in core preview');
 assert.equal(existsSync(join(output,'staging/imile-management/fleet/operations-data.mjs')),true,
   'Pure fleet expiry schema remains available to Depot alerts');
 assert.doesNotMatch(menu,/href="\.\/qa\/|href="\.\/fleet\/operations\.html"/);
 const depot=readFileSync(join(output,'depokapacitas/app.js'),'utf8');
 const alerts=readFileSync(join(output,'staging/imile-management/central-alerts.mjs'),'utf8');
 assert.doesNotMatch(depot,/fleet\/operations\.html/);
 assert.doesNotMatch(alerts,/fleet\/operations\.html/);
 assert.match(depot,/staging\/imile-management\/cutover\.html/);
 for(const dependency of [
   'depokapacitas/keyed-live-master.mjs',
   'depokapacitas/keyed-booking-capacity.mjs',
   'depokapacitas/canonical-booking-transaction.mjs',
   'depokapacitas/canonical-booking-gate.mjs',
   'depokapacitas/canonical-source-health.mjs',
   'features/fleet-depo-canonical-transition.mjs'
 ]) assert.equal(existsSync(join(output,dependency)),true,
   'Required Depot module missing: '+dependency);
 assert.equal(existsSync(join(output,'staging/imile-management/fleet/index.html')),false,
   'Fleet prototype landing page must not be packaged as the original Fleet');
 const depHtml=readFileSync(join(output,'depokapacitas/index.html'),'utf8');
 assert.equal(depHtml.includes('href="./TELEPITES.md"'),false,
  'Core preview must not link an install guide that is not in the package');
 assert.equal(existsSync(join(output,'depokapacitas/TELEPITES.md')),false);
 assert.equal(existsSync(join(output,'depokapacitas/index.html')),true);
 assert.equal(existsSync(join(output,'staging/imile-management/cutover.html')),true);
 assert.equal(existsSync(join(output,'index.html')),true);
 assert.equal(existsSync(join(output,'staging/imile-management/app.mjs')),true);
 assert.equal(existsSync(join(output,'firebase.json')),true);
 const bundled=readdirSync(join(output,'staging/imile-management'));
 assert.equal(bundled.includes('reports'),false);
 for(let i=0;i<originals.length;i++)
  assert.equal(readFileSync(join(root,originals[i]),'utf8'),sourceBefore[i],
   'Original Git-tracked source must remain byte-for-byte unchanged');
});

// This proves only the narrowed staging *package*, NOT authenticated owner
// import, built original Fleet, production IAM, Hosting, Rules or final GO.
