import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const html=read('./cutover.html'),ui=read('./cutover-app.mjs'),
 menu=read('./index.html'),entry=read('./app.mjs'),build=read('./build-preview.mjs'),
 preflight=read('./core-cutover-preflight.mjs');
const fields=[
 'legacyServerVersionConfirmed','legacyPendingLocalChangesResolved','legacyFullBackupVerified',
 'stagingRestoreTestPassed','dedicatedUsersApproved','durableHostingReady',
 'businessDataMigrationApproved'
];
let passed=0;const test=(label,fn)=>{try{fn();passed++;}catch(e){throw Error(label+': '+e.message,{cause:e})}};
test('only admin sees menu link',()=>{
 assert.match(menu,/id="cutoverLink" hidden/);
 assert.match(entry,/\$\('cutoverLink'\)\.hidden=profile\.role!=='admin'/);
});
test('requires explicit admin Firebase profile validation',()=>{
 assert.match(ui,/profile\.data\(\)\?\.role!=='admin'/);
 assert.match(ui,/role\.role!=='admin'/);
 assert.match(ui,/role\?\.active!==true/);
});
test('uses server reads of both shared staging collections',()=>{
 for(const collection of ['drivers','vehicles'])assert.match(ui,new RegExp("getDocsFromServer\\(collection\\(db,'"+collection+"'\\)\\)"));
});
test('does not import browser or Firestore write methods',()=>{
 assert.doesNotMatch(ui,/\b(?:runTransaction|setDoc|updateDoc|addDoc|deleteDoc|writeBatch|fetch|XMLHttpRequest)\s*\(/);
 assert.match(ui,/assessFleetCutover/);
});
test('old JSON stays in browser memory',()=>{
 assert.match(html,/type="file"/);
 assert.match(ui,/JSON\.parse\(await file\.text\(\)\)/);
 assert.doesNotMatch(ui,/\b(?:uploadBytes|uploadString|sendBeacon)\s*\(/);
});
test('all seven cutover gates default unchecked',()=>{
 for(const field of fields){
  assert.match(html,new RegExp('data-gate="'+field+'"'));
  assert.doesNotMatch(html,new RegExp('data-gate="'+field+'"[^>]*checked'));
  assert.match(ui,new RegExp("'"+field+"'"));
 }
});
test('result is only aggregated and link never shows raw IDs',()=>{
 assert.match(ui,/report\.counts\.legacyVehicles/);
 assert.match(ui,/report\.counts\.legacyFuelCards/);
 assert.match(ui,/report\.holds/);
 assert.doesNotMatch(ui,/\.daCode|\.plate|\.phone|\.rendszam|\.name\}/);
});
test('shows distinct source quality and real staging conflict labels',()=>{
 assert.match(ui,/legacy_source_quality:h=>/);
 assert.match(ui,/ismeretlen futárstátusz:/);
 assert.match(ui,/staging_master_integrity:h=>/);
 assert.match(ui,/master_data_conflict:h=>'Valódi törzsadat-ütközés/);
 assert.match(ui,/other_master_blockers:h=>/);
 assert.match(preflight,/sourceQualityBlockers/);
 assert.match(preflight,/actualMasterConflicts/);
 assert.doesNotMatch(preflight,/reason:'master_data_conflict',count:source\.counts\.blockers/);
});
test('unauthed access cannot view form',()=>{
 assert.match(html,/id="work" hidden/);
 assert.match(ui,/\$\('work'\)\.hidden=true/);
 assert.match(ui,/if\(!user\)/);
});
test('staging project hardcoded allowlist',()=>{
 assert.match(ui,/firebaseConfig\.projectId!=='imile-management-staging'/);
});
test('source size limited and cannot be marked verified',()=>{
 assert.match(ui,/15\*1024\*1024/);
 assert.match(ui,/getDocFromServer\(doc\(db,'users',uid\)\)/);
 assert.match(html,/Ez nem adatimport/);
});
test('redacted summary can be downloaded without cloud writes',()=>{
 assert.match(ui,/new Blob/);
 assert.match(ui,/imile_core_atallas_nevtelen_ellenorzes\.json/);
});
test('all files included in isolated preview without legacy HTML',()=>{
 for(const filename of ['cutover.html','cutover-app.mjs','core-cutover-preflight.mjs'])
  assert.ok(build.includes("staging/imile-management/"+filename));
 assert.doesNotMatch(build,/^\s*'index\.html',/m);
});
console.log('PASS: '+passed+' admin-only browser cutover readiness checks, no uploads/writes');
