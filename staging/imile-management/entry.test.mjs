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
const qaJs=read('staging/imile-management/qa/app.mjs');
const qaHtml=read('staging/imile-management/qa/index.html');
assert.ok(qaJs.includes("firebaseConfig.projectId==='imile-management-staging'"));
assert.ok(qaJs.includes("profile.data().role==='admin'"));
assert.ok(qaJs.includes("tx.get(driverRef)"));
assert.ok(qaJs.includes("tx.get(carRef)"));
assert.ok(qaJs.includes('SYNTHETIC_TEST'));
assert.ok(qaJs.includes('TESTCAR01'));
assert.ok(qaJs.includes('window.confirm('));
assert.ok(qaHtml.includes('csak'));
assert.doesNotMatch(qaJs,/deleteDoc\(|tx\.delete\(/);
assert.ok(fleetJs.includes("getDoc(doc(db,'users',user.uid))"));
assert.ok(fleetJs.includes('onSnapshot(collection(db,name)'));
assert.ok(fleetJs.includes('allowedProfile(profile)'));
assert.ok(!fleetJs.includes('setDoc('));

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
assert.ok(menu.includes('Flotta előnézet (csak olvasás)'));
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
   'staging/imile-management/fleet/index.html',
   'staging/imile-management/fleet/app.mjs',
   'staging/imile-management/qa/index.html',
   'staging/imile-management/qa/app.mjs',
   'staging/imile-management/shared-import-plan.mjs',
   'staging/imile-management/shared-records.mjs',
   'depokapacitas/index.html','depokapacitas/app.js','depokapacitas/style.css',
   'depokapacitas/firebase-config.js','depokapacitas/import-dates.mjs',
   'depokapacitas/import-validation.mjs','depokapacitas/capacity-eligibility.mjs'
  ];
  for(const p of paths)assert.ok(existsSync(join(preview,p)),'Preview missing '+p);
  assert.ok(!existsSync(join(preview,'features')),'Live fleet features must not be copied');
  assert.ok(existsSync(join(preview,'staging/imile-management/fleet/index.html')));
  assert.ok(!existsSync(join(preview,'flotta')),'Live Fleet must not be copied');
  assert.ok(!existsSync(join(preview,'depokapacitas/google-sync')),'Apps Script must not be copied');
  assert.ok(readFileSync(join(preview,'index.html'),'utf8').includes('staging/imile-management/index.html'));
  assert.equal(JSON.parse(readFileSync(join(preview,'firebase.json'),'utf8')).hosting.public,'.');
}finally{rmSync(preview,{recursive:true,force:true});}
console.log('PASS: unified Firebase login, staging-only module selector, minimal preview build');
