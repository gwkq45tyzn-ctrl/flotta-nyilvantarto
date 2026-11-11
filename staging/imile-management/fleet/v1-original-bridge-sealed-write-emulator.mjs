/**
 * Test REAL original Fleet browser bridge code against full iMile restricted
 * Rules + signed-in local Firebase SDK; test-only VM exposes its inner
 * pushTransactional() without changing production source.
 * Synthetic users and data only. Expected RED until bridge fixes sealed flow.
 */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import {doc,getDoc,setDoc,updateDoc,runTransaction,Timestamp} from 'firebase/firestore';

const uid='synthetic-imile-v1-admin-0000001',email='imilemanagement@imile-management-staging.firebaseapp.com';
const sourceSha='b'.repeat(64);
const rulesText=await readFile(new URL('../../../depokapacitas/firestore-v1-restricted.rules',import.meta.url),'utf8');
assert.match(rulesText,/REPLACE_WITH_REAL_SHARED_UID/);
const bridge=await readFile(new URL('../../../features/firestore-bridge.js',import.meta.url),'utf8');
const hook='  boot();\n})();';
assert.equal(bridge.split(hook).length,2,'original bridge hook must exist once');
const instrumented=bridge.replace(hook,[
 '  // This QA hook is injected into memory ONLY; it is not production source.',
 '  window.__qaBridge={',
 '    configure:function(nextDb,currentUid,serverRev,confirmedBaseline){',
 '      db=nextDb; auth={currentUser:{uid:currentUid}};',
 '      memberVerified=true;migrationServerApproved=true;',
 '      currentRevision=serverRev;requeueCount=3;',
 '      // Synthetic fixture models the fully confirmed keyed rows that the',
 '      // real original Fleet applies via onSnapshot before user edits.',
 '      appliedKeyed={',
 '        drivers:new Map(confirmedBaseline.drivers.map(d=>[d.daCode.trim().toUpperCase(),JSON.parse(JSON.stringify(d))])),',
 `        vehicles:new Map(confirmedBaseline.vehicles.map(v=>[v.rendszam.replaceAll('-', '').replaceAll(' ', '').toUpperCase(),JSON.parse(JSON.stringify(v))]))`,
 '      };',
 '    },submit:pushTransactional',
 '  };',
 '  boot();',
 '})();'
].join('\n'));
const env=await initializeTestEnvironment({
 projectId:'demo-imile-restricted-v1',
 firestore:{host:'127.0.0.1',port:8787,
   rules:rulesText.replaceAll('REPLACE_WITH_REAL_SHARED_UID',uid)}
});
const db=env.authenticatedContext(uid,{email}).firestore();
const ref=path=>doc(db,path);
const fleet=()=>({
 revision:1,sealed:true,migrationSourceSha256:sourceSha,
 drivers:[{id:'driver-1',daCode:'DA0001',name:'Rich original Driver',
  agency:'SYNTHETIC',status:'aktiv',kapacitas:50,history:[{note:'PRESERVE DRIVER HISTORY'}]}],
 vehicles:[{id:'car-1',rendszam:'ABC-123',normalizedPlate:'ABC123',
  status:'aktiv',gyartmany:'Ford',modell:'Transit',
  history:[{note:'PRESERVE CAR HISTORY'}]}],
 contacts:[{id:'contact-1',name:'Original contact'}],
 fuelCards:[{id:'card-1',history:[{note:'PRESERVE FUEL HISTORY'}]}]
});
async function reset(sealed=true){
 await env.clearFirestore();
 await env.withSecurityRulesDisabled(async ctx=>{
  const admin=ctx.firestore();
  await setDoc(doc(admin,'users',uid),{name:'TEST ADMIN',active:true,role:'admin'});
  await setDoc(doc(admin,'flottaMigrationApproval','current'),{
   status:'approved',approvedUid:uid,sourceSha256:sourceSha,
   approvedAt:Timestamp.fromDate(new Date('2026-01-01T00:00:00Z'))
  });
  const snap=fleet();if(!sealed)delete snap.sealed;
  await setDoc(doc(admin,'flottaSharedState','current'),snap);
  await setDoc(doc(admin,'flottaDrivers','DA0001'),{
   ...fleet().drivers[0],revision:9,extra:{privateNote:'PRESERVE'}});
  await setDoc(doc(admin,'flottaVehicles','ABC123'),{
   ...fleet().vehicles[0],revision:10,extra:{inspection:'PRESERVE'}});
 });
}
function runOriginalBridge(draft){
 const local=new Map([['flotta_firestore_primary','1'],['flotta_import_verified','1']]);
 const ui={textContent:'',style:{}},window={};
 const writes=[],bridgeErrors=[];
 const adapter={
  doc:path=>({inner:doc(db,path),path}),
  runTransaction:fn=>runTransaction(db,tx=>fn({
   get:async r=>{const snap=await tx.get(r.inner);return {exists:snap.exists(),data:()=>snap.data()};},
   set:(r,payload)=>{writes.push(r.path);tx.set(r.inner,JSON.parse(JSON.stringify(payload)));}
  }))
 };
 const sandbox=vm.createContext({
  window,document:{readyState:'loading',addEventListener(){},getElementById:()=>ui},
  localStorage:{getItem:k=>local.get(k)??null,setItem:(k,v)=>local.set(k,String(v)),removeItem:k=>local.delete(k)},
  snapshot:()=>structuredClone(draft),
  firebase:{firestore:{FieldValue:{serverTimestamp:()=>Timestamp.fromDate(new Date('2026-11-10T00:00:00Z'))}}},
  console:{error:(...args)=>bridgeErrors.push(args.map(e=>e?.message||String(e)).join(' | ')),warn(){},log(){}},Promise,setTimeout,clearTimeout,Date,Blob,URL,JSON
 });
 vm.runInContext(instrumented,sandbox,{filename:'ACTUAL/features/firestore-bridge.js'});
 window.__qaBridge.configure(adapter,uid,1,fleet());
 return {submit:()=>window.__qaBridge.submit(),writes,bridgeErrors,ui};
}
const failures=[];
try{
 await reset();
 const edit=fleet();edit.drivers[0].kapacitas=70;
 const a=runOriginalBridge(edit);await a.submit();
 const keyed=(await getDoc(ref('flottaDrivers/DA0001'))).data();
 if(keyed.kapacitas!==70){
  failures.push('P1 SEALED ORIGINAL DRIVER EDIT NOT SAVED TO KEYED MASTER');
  console.error(failures.at(-1),'keyed capacity:',keyed.kapacitas,'attempted writes:',a.writes,'bridgeErrors:',a.bridgeErrors);
 }else console.log('PASS [E+REAL BRIDGE] sealed driver edit persisted');

 await reset();
 const onlyContacts=fleet();
 onlyContacts.contacts[0].name='Updated original contact';
 const b=runOriginalBridge(onlyContacts);await b.submit();
 const archived=(await getDoc(ref('flottaSharedState/current'))).data();
 const keyedD=(await getDoc(ref('flottaDrivers/DA0001'))).data();
 const keyedV=(await getDoc(ref('flottaVehicles/ABC123'))).data();
 if(archived.contacts[0].name!=='Updated original contact'){
  failures.push('P1 CONTACTS-ONLY SEALED SAVE FAILED');
  console.error(failures.at(-1),'bridgeErrors:',b.bridgeErrors,'attempted:',b.writes);
 }else console.log('PASS [E+REAL BRIDGE] contacts-only edit saved');
 if(!keyedD.history||!keyedD.extra||!keyedD.name){
  failures.push('P0 RICH DRIVER DATA LOSS FROM UNRELATED CONTACTS SAVE');
  console.error(failures.at(-1),keyedD);
 }else console.log('PASS [E+REAL BRIDGE] keyed driver rich data retained');
 if(!keyedV.history||!keyedV.extra||!keyedV.gyartmany){
  failures.push('P0 RICH VEHICLE DATA LOSS FROM UNRELATED CONTACTS SAVE');
  console.error(failures.at(-1),keyedV);
 }else console.log('PASS [E+REAL BRIDGE] keyed vehicle rich data retained');
 if(b.writes.some(p=>p.startsWith('flottaDrivers/')||p.startsWith('flottaVehicles/'))){
  failures.push('P0 CONTACTS-ONLY SAVE REWROTE UNCHANGED KEYED MASTERS');
  console.error(failures.at(-1),b.writes);
 }else console.log('PASS [E+REAL BRIDGE] unrelated contact save never rewrites keyed masters');

 // Another signed-in computer changed the driver's current keyed capacity to
 // 80. A stale original UI draft based on the frozen archive (50) must not
 // overwrite it with 70, even though it can edit different fields safely.
 await reset();
 await updateDoc(ref('flottaDrivers/DA0001'),{kapacitas:80,revision:10});
 const stale=fleet();stale.drivers[0].kapacitas=70;
 const staleBrowser=runOriginalBridge(stale);
 await staleBrowser.submit();
 const afterStale=(await getDoc(ref('flottaDrivers/DA0001'))).data();
 const archiveStale=(await getDoc(ref('flottaSharedState/current'))).data();
 if(afterStale.kapacitas!==80 || archiveStale.revision!==1){
  failures.push('P0 STALE FLEET UI OVERWROTE ANOTHER BROWSER KEYED CAPACITY OR SOURCE REVISION');
  console.error(failures.at(-1),{capacity:afterStale.kapacitas,revision:archiveStale.revision});
 }else console.log('PASS DENY [E+REAL BRIDGE] stale original UI draft cannot overwrite concurrent keyed capacity');

 await reset(false);
 const pre=fleet();pre.drivers[0].kapacitas=60;
 const c=runOriginalBridge(pre);await c.submit();
 const preResult=(await getDoc(ref('flottaSharedState/current'))).data();
 if(preResult.drivers[0].kapacitas!==50 || preResult.revision!==1 ||
    c.writes.length){
  failures.push('P0 PRESEAL BROWSER MODIFIED FROZEN ARCHIVED DRIVER');
  console.error(failures.at(-1),'bridgeErrors:',c.bridgeErrors,'attempted:',c.writes);
 }else console.log('PASS DENY [E+REAL BRIDGE] original pre-cutover source is read-only; no phantom keyed writes');
 assert.deepEqual(failures,[],'RELEASE NO-GO: actual bridge failures '+failures.join(' | '));
 console.log('ALL ORIGINAL BRIDGE FIRESTORE ACCEPTANCE PASS');
}finally{await env.cleanup();}
