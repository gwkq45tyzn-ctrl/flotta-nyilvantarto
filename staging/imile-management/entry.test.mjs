import assert from 'node:assert/strict';
import {readFileSync,existsSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
const root=resolve(import.meta.dirname,'../..');
const read=p=>readFileSync(join(root,p),'utf8');
const menu=read('staging/imile-management/index.html');
const entry=read('staging/imile-management/app.mjs');
const depotHtml=read('depokapacitas/index.html');
const depotJs=read('depokapacitas/app.js');
const fleetJs=read('staging/imile-management/fleet/app.mjs');
const fleetHtml=read('staging/imile-management/fleet/index.html');
const fleetEditor=read('staging/imile-management/fleet/master-editor.mjs');
assert.ok(fleetEditor.includes("imile-management-staging"));
assert.ok(fleetEditor.includes('runTransaction(db,async tx=>'));
assert.ok(fleetJs.includes('saveFleetMaster({'));
assert.ok(fleetJs.includes("profile.role==='admin'"));
assert.ok(fleetHtml.includes('id="adminDriverPanel" hidden'));
assert.ok(fleetHtml.includes('id="adminVehiclePanel" hidden'));
const qaJs=read('staging/imile-management/qa/app.mjs');
const qaHtml=read('staging/imile-management/qa/index.html');
const qaFlow=read('staging/imile-management/qa/run-flow.mjs');
const qaFixtures=read('staging/imile-management/qa/functional-flow.mjs');
assert.ok(qaJs.includes("executeStagingBookingQa(db,writeLog)"));
assert.ok(qaHtml.includes('id="runFlow"'));
assert.ok(qaFlow.includes("runTransaction(db,async tx=>"));
assert.ok(qaFlow.includes("tx.delete(booking);tx.delete(claim)"));
assert.ok(qaFlow.includes("permissionDenied(error)"));
assert.ok(qaFixtures.includes("QA_TEST_DATE='2099-01-15'"));
assert.ok(qaFixtures.includes("QA_DRIVER_ID='SYNTHETIC_TEST'"));
assert.ok(qaJs.includes("firebaseConfig.projectId==='imile-management-staging'"));
assert.ok(qaJs.includes("profile.data().role==='admin'"));
assert.ok(qaJs.includes("tx.get(driverRef)"));
assert.ok(qaJs.includes("tx.get(carRef)"));
assert.ok(qaJs.includes('SYNTHETIC_TEST'));
assert.ok(qaJs.includes('TESTCAR01'));
assert.ok(qaJs.includes("$('consent').checked"));
assert.ok(qaHtml.includes('type="checkbox" id="consent"'));
assert.ok(qaHtml.includes('csak'));
assert.doesNotMatch(qaJs,/deleteDoc\(|tx\.delete\(/);
assert.ok(fleetJs.includes("getDoc(doc(db,'users',user.uid))"));
assert.ok(fleetJs.includes('onSnapshot(collection(db,name)'));
assert.ok(fleetJs.includes('allowedProfile(profile)'));
assert.ok(fleetJs.includes('saveFleetMaster({'));
assert.ok(fleetJs.includes("profile.role==='admin'"));
assert.ok(fleetJs.includes("onSnapshot(collection(db,name)"));

assert.ok(menu.includes('id="loginForm"'));
assert.ok(menu.includes('name="username" type="text"'));
assert.ok(menu.includes('Felhasználónév'));
assert.ok(!menu.includes('type="email"'));
assert.ok(entry.includes("loginEmailForUsername(data.get('username'))"));
assert.ok(entry.includes("signInWithEmailAndPassword(auth,loginEmail,"));
assert.ok(menu.includes('id="menu"'));
assert.ok(menu.includes('id="depoLink"'));
assert.ok(menu.includes('id="fleetLink"'));
assert.ok(menu.includes('id="qaLink" hidden'));
assert.ok(entry.includes("$('qaLink').hidden=profile.role!=='admin'"));
assert.ok(menu.includes('Flotta megnyitása (staging)'));
assert.doesNotMatch(menu,/FLOTTA_GATE_USERS|password.*digest|SECRET_ACCESS_KEY/);
assert.ok(entry.includes("getDoc(doc(db,'users',user.uid))"));
assert.ok(entry.includes('allowedProfile(profile)'));
assert.ok(entry.includes('onAuthStateChanged'));
assert.ok(entry.includes('signInWithEmailAndPassword'));
assert.ok(entry.includes("getAuth(firebase)"));
assert.ok(depotJs.includes("window.location.replace('../staging/imile-management/index.html')"));
assert.ok(depotJs.includes("getDoc(doc(db,'users',user.uid))"));
assert.ok(depotHtml.includes('← Rendszerválasztó'));
const allowed=read('staging/imile-management/build-preview.mjs');
assert.doesNotMatch(allowed,/^\s*'index\.html',/m);
assert.doesNotMatch(allowed,/^\s*'features\/.*',/m);

const preview=join(root,'preview-imile-staging');
assert.ok(!existsSync(preview),'Preview output already exists; tests must start from a clean checkout');
try{
  const result=spawnSync(process.execPath,['staging/imile-management/build-preview.mjs'],{cwd:root,encoding:'utf8'});
  assert.equal(result.status,0,'Preview build failed: '+result.stderr);
  const paths=[
   'index.html','firebase.json',
   'staging/imile-management/index.html',
   'staging/imile-management/app.mjs',
   'staging/imile-management/session-policy.mjs',
   'staging/imile-management/attendance-handover.mjs',
   'staging/imile-management/central-alerts.mjs',
   'staging/imile-management/fleet/index.html',
   'staging/imile-management/fleet/app.mjs',
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
   'staging/imile-management/shared-import-plan.mjs',
   'staging/imile-management/shared-records.mjs',
   'depokapacitas/index.html','depokapacitas/app.js','depokapacitas/style.css',
   'depokapacitas/firebase-config.js','depokapacitas/import-dates.mjs',
   'depokapacitas/import-validation.mjs','depokapacitas/capacity-eligibility.mjs',
   'depokapacitas/import-encoding.mjs',
   'depokapacitas/source-health.mjs','depokapacitas/parcel-preview.html',
   'depokapacitas/parcel-preview.css','depokapacitas/parcel-preview-app.mjs',
   'depokapacitas/parcel-preview.mjs'
  ];
  for(const p of paths)assert.ok(existsSync(join(preview,p)),'Preview missing '+p);
  assert.ok(!existsSync(join(preview,'features')),'Live fleet features must not be copied');
  assert.ok(existsSync(join(preview,'staging/imile-management/fleet/index.html')));
  assert.ok(!existsSync(join(preview,'flotta')),'Live Fleet must not be copied');
  assert.ok(!existsSync(join(preview,'depokapacitas/google-sync')),'Apps Script must not be copied');
  assert.ok(readFileSync(join(preview,'index.html'),'utf8').includes('staging/imile-management/index.html'));
  const hosting=JSON.parse(readFileSync(join(preview,'firebase.json'),'utf8')).hosting;
  assert.equal(hosting.public,'.');
  for(const pattern of ['**/*.log','**/*.log.*'])
    assert.ok(hosting.ignore.includes(pattern),'CLI diagnostic logs must never be published: '+pattern);
}finally{rmSync(preview,{recursive:true,force:true});}
console.log('PASS: unified Firebase login, staging-only module selector, minimal preview build');
