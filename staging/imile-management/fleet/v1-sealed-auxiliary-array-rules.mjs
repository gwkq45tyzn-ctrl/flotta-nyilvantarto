/**
 * Direct signed-in SDK must not replace the sealed archive fuelCards or
 * contacts arrays. Drivers and vehicles are already immutable. Synthetic
 * emulator only. The original P0 booking probe is not edited.
 */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import {doc,getDoc,setDoc,updateDoc,Timestamp} from 'firebase/firestore';

const uid='synthetic-imile-v1-admin-0000001';
const sha='d'.repeat(64);
const email='imilemanagement@imile-management-staging.firebaseapp.com';
const source=await readFile(new URL(
  '../../../depokapacitas/firestore-v1-restricted.rules',import.meta.url),'utf8');
assert.match(source,/REPLACE_WITH_REAL_SHARED_UID/);
assert.match(source,/request\.resource\.data\.drivers == resource\.data\.drivers/);
assert.match(source,/request\.resource\.data\.vehicles == resource\.data\.vehicles/);
const env=await initializeTestEnvironment({
  projectId:'demo-imile-restricted-v1',
  firestore:{host:'127.0.0.1',port:8787,
    rules:source.replaceAll('REPLACE_WITH_REAL_SHARED_UID',uid)}
});
const db=env.authenticatedContext(uid,{email}).firestore();
const fleetRef=doc(db,'flottaSharedState','current');
const fuelHistory=[{note:'PRESERVE FUEL HISTORY'}];
const contactExtra={keep:true};
function base(){
  return {
    revision:1,sealed:true,migrationSourceSha256:sha,
    drivers:[{id:'driver-1',daCode:'DA0001',status:'aktiv',kapacitas:50,
      history:[{note:'PRESERVE DRIVER HISTORY'}]}],
    vehicles:[{id:'car-1',rendszam:'ABC-123',status:'aktiv',
      normalizedPlate:'ABC123',history:[{note:'PRESERVE CAR HISTORY'}]}],
    fuelCards:[{id:'card-1',number:'OLD-1',history:fuelHistory,extra:{pin:'keep'}}],
    contacts:[{id:'contact-1',name:'Original contact',extra:contactExtra}]
  };
}
async function seed(){
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async ctx=>{
    const admin=ctx.firestore();
    await setDoc(doc(admin,'users',uid),{name:'SYNTHETIC ADMIN',active:true,role:'admin'});
    await setDoc(doc(admin,'flottaMigrationApproval','current'),{
      status:'approved',approvedUid:uid,sourceSha256:sha,
      approvedAt:Timestamp.fromDate(new Date('2026-01-01T00:00:00Z'))
    });
    await setDoc(doc(admin,'flottaSharedState','current'),base());
    await setDoc(doc(admin,'flottaDrivers','DA0001'),{
      ...base().drivers[0],sourceIndex:0,revision:4
    });
  });
}
try{
  await seed();
  await assert.rejects(()=>updateDoc(fleetRef,{
    revision:2,
    fuelCards:[{id:'card-1',number:'WIPED'}]
  }),err=>err.code==='permission-denied');
  const afterFuel=(await getDoc(fleetRef)).data();
  assert.equal(afterFuel.revision,1);
  assert.deepEqual(afterFuel.fuelCards[0].history,fuelHistory);
  assert.equal(afterFuel.fuelCards[0].number,'OLD-1');
  console.log('PASS DENY [E+SDK]: direct write cannot replace the sealed fuelCards array');

  await assert.rejects(()=>updateDoc(fleetRef,{
    revision:2,
    contacts:[{id:'contact-1',name:'Replaced contact'}]
  }),err=>err.code==='permission-denied');
  const afterContact=(await getDoc(fleetRef)).data();
  assert.equal(afterContact.contacts[0].name,'Original contact');
  assert.deepEqual(afterContact.contacts[0].extra,contactExtra);
  assert.deepEqual(afterContact.drivers,base().drivers);
  assert.deepEqual(afterContact.vehicles,base().vehicles);
  console.log('PASS DENY [E+SDK]: direct write cannot replace the sealed contacts array');

  await assert.rejects(()=>updateDoc(fleetRef,{
    revision:2,
    fuelCards:[{...base().fuelCards[0],history:[{note:'FORGED'}],extra:{pin:'stolen'}}]
  }),err=>err.code==='permission-denied');
  const afterHistory=(await getDoc(fleetRef)).data();
  assert.equal(afterHistory.revision,1);
  assert.deepEqual(afterHistory.fuelCards[0].history,fuelHistory);
  assert.equal(afterHistory.fuelCards[0].extra.pin,'keep');
  assert.equal(afterHistory.fuelCards[0].number,'OLD-1');
  console.log('PASS DENY [E+SDK]: rich fuel history and extra cannot replace the sealed original');

  await assert.rejects(()=>updateDoc(fleetRef,{
    revision:2,
    contacts:[{...base().contacts[0],extra:{keep:false}}]
  }),err=>err.code==='permission-denied');
  assert.deepEqual((await getDoc(fleetRef)).data().contacts[0].extra,contactExtra);
  console.log('PASS DENY [E+SDK]: rich contact extra cannot replace the sealed original');

  await updateDoc(fleetRef,{revision:2,updatedBy:uid});
  const meta=(await getDoc(fleetRef)).data();
  assert.equal(meta.revision,2);
  assert.deepEqual(meta.fuelCards,base().fuelCards);
  assert.deepEqual(meta.contacts,base().contacts);
  assert.equal(meta.sealed,true);
  console.log('PASS ALLOW [E+SDK]: revision metadata still updates when all four archive arrays are unchanged');

  await updateDoc(doc(db,'flottaDrivers','DA0001'),{kapacitas:70,revision:5});
  assert.equal((await getDoc(doc(db,'flottaDrivers','DA0001'))).data().kapacitas,70);
  assert.equal((await getDoc(doc(db,'flottaDrivers','DA0001'))).data().history[0].note,
    'PRESERVE DRIVER HISTORY');
  console.log('PASS ALLOW [E+SDK]: keyed driver capacity edit is unchanged by the archive-array lock');
}finally{
  await env.cleanup();
}
