/**
 * Independent #184 original FULL restricted Rules (not mock) signed-in SDK QA.
 * Includes legally seeded positive post-seal edits, poisoned identity and
 * authenticated forged-claims negative probes, and rich history retention.
 *
 * Local Firebase emulator with synthetic identity/source ONLY.
 * This never proves a real production privileged importer or IAM.
 */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import {doc,setDoc,updateDoc,getDoc,deleteDoc,Timestamp} from 'firebase/firestore';

const uid='synthetic-imile-v1-admin-0000001';
const email='imilemanagement@imile-management-staging.firebaseapp.com';
const digest='a'.repeat(64);
const rulesRaw=await readFile(new URL('../../../depokapacitas/firestore-v1-restricted.rules',import.meta.url),'utf8');
assert.match(rulesRaw,/REPLACE_WITH_REAL_SHARED_UID/);
const env=await initializeTestEnvironment({
  projectId:'demo-imile-restricted-v1',
  firestore:{
    host:'127.0.0.1',port:8787,
    rules:rulesRaw.replaceAll('REPLACE_WITH_REAL_SHARED_UID',uid)
  }
});
const client=env.authenticatedContext(uid,{email}).firestore();
let pass=0;
async function denied(name,promise){
  await assertFails(promise);
  pass++;
  console.log('PASS DENY '+name);
}
async function allowed(name,promise){
  await assertSucceeds(promise);
  pass++;
  console.log('PASS ALLOW '+name);
}
const driverPath=db=>doc(db,'flottaDrivers','DA0001');
const carPath=db=>doc(db,'flottaVehicles','ABC123');
const driver={
  id:'driver-1',daCode:'DA0001',status:'aktiv',
  kapacitas:80,revision:1,sourceIndex:0,
  history:[{type:'original',nested:{important:'never remove'}}],
  contact:{name:'SYNTHETIC',note:'full-rich metadata'}
};
const car={
  id:'vehicle-1',rendszam:'ABC-123',status:'aktiv',
  revision:1,sourceIndex:0,history:[{type:'service',note:'retain'}],
  vehicleExtra:{year:2024}
};
try{
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async ctx=>{
    const db=ctx.firestore();
    await setDoc(doc(db,'users',uid),{active:true,role:'admin'});
    await setDoc(doc(db,'flottaMigrationApproval','current'),{
      status:'approved',approvedUid:uid,sourceSha256:digest,
      approvedAt:Timestamp.fromDate(new Date('2026-01-01T00:00:00Z'))
    });
    await setDoc(doc(db,'flottaSharedState','current'),{
      revision:1,migrationSourceSha256:digest,sealed:true,
      drivers:[{id:'driver-1',daCode:'DA0001',kapacitas:80,history:[{type:'original'}]}],
      vehicles:[{id:'vehicle-1',rendszam:'ABC-123',status:'aktiv'}],
      fuelCards:[],contacts:[]
    });
    await setDoc(driverPath(db),driver);
    await setDoc(carPath(db),car);
  });
  // Needed: proves valid authenticated Fleet editor remains useful after
  // a synthetic valid seal, not just that everything is blocked.
  await allowed('post-seal legitimate capacity update',
    updateDoc(driverPath(client),{kapacitas:81,revision:2}));
  await allowed('post-seal legitimate vehicle status',
    updateDoc(carPath(client),{status:'szerviz',revision:2}));
  const d=(await getDoc(driverPath(client))).data();
  const v=(await getDoc(carPath(client))).data();
  assert.deepEqual(d.history,driver.history);
  assert.deepEqual(d.contact,driver.contact);
  assert.equal(d.sourceIndex,0);
  assert.equal(d.revision,2);
  assert.deepEqual(v.history,car.history);
  assert.deepEqual(v.vehicleExtra,car.vehicleExtra);
  assert.equal(v.sourceIndex,0);
  pass++;
  console.log('PASS READBACK immutable sourceIndex + full rich histories');
  // No false-positive DENY from a source/approval gate: both valid positive
  // edits above succeeded before these malicious attempts.
  await denied('client writes arbitrary sourceIndex',
    updateDoc(driverPath(client),{sourceIndex:1,revision:3}));
  await denied('client writes negative sourceIndex',
    updateDoc(carPath(client),{sourceIndex:-1,revision:3}));
  await denied('forged driver identity claim',
    setDoc(doc(client,'flottaDriverClaims','DA0001'),{sourceIndex:0}));
  await denied('forged vehicle identity claim',
    setDoc(doc(client,'flottaVehicleClaims','ABC123'),{sourceIndex:0}));
  await denied('driver stable identifier drift',
    updateDoc(driverPath(client),{daCode:'DA0002',revision:3}));
  await denied('vehicle stable plate drift',
    updateDoc(carPath(client),{rendszam:'XYZ-999',revision:3}));
  await denied('rich driver history destroyed',
    updateDoc(driverPath(client),{history:[],revision:3}));
  await denied('revision rollback',
    updateDoc(driverPath(client),{revision:1}));
  await denied('user creates forged canonical driver',
    setDoc(doc(client,'flottaDrivers','DA0002'),
      {daCode:'DA0002',sourceIndex:1,revision:1,status:'aktiv',kapacitas:80}));
  await denied('user deletes trusted driver',deleteDoc(driverPath(client)));
  const d2=(await getDoc(driverPath(client))).data();
  assert.equal(d2.daCode,'DA0001');
  assert.equal(d2.kapacitas,81);
  assert.equal(d2.revision,2);
  assert.deepEqual(d2.history,driver.history);
  console.log('PASS [E+SDK] '+pass+' independent ALLOW/DENY/readback controls');
}finally{
  await env.cleanup();
}
