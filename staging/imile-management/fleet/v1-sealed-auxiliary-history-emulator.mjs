/**
 * #186 Fleet+Depot: a sealed original Fleet fuel-card edit must not drop
 * rich history. The form snapshot omits history; the bridge used to write
 * that reduced object into flottaSharedState. Synthetic emulator only.
 * The original index.html and the restricted Rules file are not modified.
 */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import {doc,getDoc,setDoc,runTransaction,Timestamp} from 'firebase/firestore';

const uid='synthetic-imile-v1-admin-0000001';
const email='imilemanagement@imile-management-staging.firebaseapp.com';
const sourceSha='c'.repeat(64);
const rulesText=await readFile(new URL(
  '../../../depokapacitas/firestore-v1-restricted.rules',import.meta.url),'utf8');
assert.match(rulesText,/REPLACE_WITH_REAL_SHARED_UID/);
const bridge=await readFile(new URL(
  '../../../features/firestore-bridge.js',import.meta.url),'utf8');
const hook='  boot();\n})();';
assert.equal(bridge.split(hook).length,2,'original bridge hook must exist once');
const instrumented=bridge.replace(hook,[
  '  window.__qaBridge={',
  '    configure:function(nextDb,currentUid,serverRev,confirmedBaseline){',
  '      db=nextDb; auth={currentUser:{uid:currentUid}};',
  '      memberVerified=true;migrationServerApproved=true;',
  '      currentRevision=serverRev;requeueCount=3;',
  '      appliedKeyed={',
  '        drivers:new Map(confirmedBaseline.drivers.map(d=>[d.daCode.trim().toUpperCase(),JSON.parse(JSON.stringify(d))])),',
  '        vehicles:new Map(confirmedBaseline.vehicles.map(v=>[v.rendszam.replaceAll("-","").replaceAll(" ","").toUpperCase(),JSON.parse(JSON.stringify(v))]))',
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
const fleet=()=>({
  revision:1,sealed:true,migrationSourceSha256:sourceSha,
  drivers:[{id:'driver-1',daCode:'DA0001',name:'Rich original Driver',
    agency:'SYNTHETIC',status:'aktiv',kapacitas:50,
    history:[{note:'PRESERVE DRIVER HISTORY'}]}],
  vehicles:[{id:'car-1',rendszam:'ABC-123',normalizedPlate:'ABC123',
    status:'aktiv',gyartmany:'Ford',modell:'Transit',
    history:[{note:'PRESERVE CAR HISTORY'}]}],
  contacts:[{id:'contact-1',name:'Original contact',extra:{keep:true}}],
  fuelCards:[{id:'card-1',number:'OLD-1',provider:'SYNTH',vehicle:'ABC-123',
    expiry:null,limit:'100',status:'aktiv',note:'',
    history:[{note:'PRESERVE FUEL HISTORY'}],
    extra:{pin:'do-not-drop'}}]
});
async function reset(){
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async ctx=>{
    const admin=ctx.firestore();
    await setDoc(doc(admin,'users',uid),{name:'TEST ADMIN',active:true,role:'admin'});
    await setDoc(doc(admin,'flottaMigrationApproval','current'),{
      status:'approved',approvedUid:uid,sourceSha256:sourceSha,
      approvedAt:Timestamp.fromDate(new Date('2026-01-01T00:00:00Z'))
    });
    const snap=fleet();
    await setDoc(doc(admin,'flottaSharedState','current'),snap);
    await setDoc(doc(admin,'flottaDrivers','DA0001'),{
      ...snap.drivers[0],sourceIndex:0,revision:9,extra:{privateNote:'PRESERVE'}});
    await setDoc(doc(admin,'flottaVehicles','ABC123'),{
      ...snap.vehicles[0],sourceIndex:0,revision:10,extra:{inspection:'PRESERVE'}});
  });
}
function runOriginalBridge(draft){
  const local=new Map([
    ['flotta_firestore_primary','1'],['flotta_import_verified','1']
  ]);
  const ui={textContent:'',style:{}},window={};
  const writes=[];
  const adapter={
    doc:path=>({inner:doc(db,path),path}),
    runTransaction:fn=>runTransaction(db,tx=>fn({
      get:async r=>{
        const snap=await tx.get(r.inner);
        return {exists:snap.exists(),data:()=>snap.data()};
      },
      set:(r,payload)=>{
        writes.push(r.path);
        tx.set(r.inner,JSON.parse(JSON.stringify(payload)));
      }
    }))
  };
  const sandbox=vm.createContext({
    window,document:{
      readyState:'loading',addEventListener(){},getElementById:()=>ui
    },
    localStorage:{
      getItem:k=>local.get(k)??null,
      setItem:(k,v)=>local.set(k,String(v)),
      removeItem:k=>local.delete(k)
    },
    snapshot:()=>structuredClone(draft),
    firebase:{firestore:{FieldValue:{
      serverTimestamp:()=>Timestamp.fromDate(new Date('2026-11-15T00:00:00Z'))
    }}},
    console:{error(){},warn(){},log(){}},
    Promise,setTimeout,clearTimeout,Date,Blob,URL,JSON
  });
  vm.runInContext(instrumented,sandbox,{filename:'ACTUAL/features/firestore-bridge.js'});
  window.__qaBridge.configure(adapter,uid,1,fleet());
  return {submit:()=>window.__qaBridge.submit(),writes};
}
function formCard(overrides={}){
  return {
    id:'card-1',number:'NEW-1',provider:'SYNTH',vehicle:'ABC-123',
    expiry:null,limit:'100',status:'aktiv',note:'',
    ...overrides
  };
}
try{
  await reset();
  const edited=fleet();
  edited.fuelCards=[formCard()];
  const saved=runOriginalBridge(edited);
  await saved.submit();
  const archived=(await getDoc(doc(db,'flottaSharedState','current'))).data();
  const card=archived.fuelCards[0];
  assert.equal(card.number,'OLD-1');
  assert.equal(archived.revision,1);
  assert.deepEqual(card.history,[{note:'PRESERVE FUEL HISTORY'}]);
  assert.deepEqual(card.extra,{pin:'do-not-drop'});
  assert.equal(archived.drivers[0].kapacitas,50);
  assert.equal(archived.contacts[0].extra.keep,true);
  assert.equal(saved.writes.some(p=>p.startsWith('flottaDrivers/')),false);
  const keyed=(await getDoc(doc(db,'flottaDrivers','DA0001'))).data();
  assert.equal(keyed.kapacitas,50);
  assert.equal(keyed.history[0].note,'PRESERVE DRIVER HISTORY');
  console.log('PASS DENY [E+REAL BRIDGE]: sealed fuelCards array cannot be replaced; history stays and the keyed driver is not rewritten');

  await reset();
  const forged=fleet();
  forged.fuelCards=[formCard({history:[{note:'FORGED'}],extra:{pin:'stolen'}})];
  await runOriginalBridge(forged).submit();
  const afterForge=(await getDoc(doc(db,'flottaSharedState','current'))).data().fuelCards[0];
  assert.equal(afterForge.number,'OLD-1');
  assert.equal((await getDoc(doc(db,'flottaSharedState','current'))).data().revision,1);
  assert.deepEqual(afterForge.history,[{note:'PRESERVE FUEL HISTORY'}]);
  assert.deepEqual(afterForge.extra,{pin:'do-not-drop'});
  console.log('PASS DENY [E+REAL BRIDGE]: a forged fuel-card history or extra cannot replace the sealed original');
}finally{
  await env.cleanup();
}
