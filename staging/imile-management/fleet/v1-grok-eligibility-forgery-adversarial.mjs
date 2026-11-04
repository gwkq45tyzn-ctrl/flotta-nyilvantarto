/**
 * Independent LOCAL Firestore SDK + real Rules emulator security regression:
 * Grok grok/v1-s7-fix-syntax-and-eligibility HEAD e58a7f026ee052974b96f7cc4d05b6c09404cfba (real syntax fix).
 *
 * A PASS on the final forged-list test means a P0 AUTHORIZATION VULNERABILITY
 * was reproduced, not that the implementation is correct or deployable.
 *
 * Entirely synthetic: no live Firestore, Auth, deployment, UID or real fleet.
 */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import {doc,getDoc,setDoc,updateDoc,runTransaction,Timestamp} from 'firebase/firestore';
import {commitCanonicalDepotBooking} from '../../../depokapacitas/canonical-booking-transaction.mjs';

const uid='synthetic-imile-v1-admin-0000001';
const email='imilemanagement@imile-management-staging.firebaseapp.com';
const sha='a'.repeat(64);
const rulesFile=await readFile(new URL('../../../depokapacitas/firestore-v1-restricted.rules',import.meta.url),'utf8');
assert.match(rulesFile,/REPLACE_WITH_REAL_SHARED_UID/);
const env=await initializeTestEnvironment({
  projectId:'demo-imile-restricted-v1',
  firestore:{host:'127.0.0.1',port:8787,
    rules:rulesFile.replaceAll('REPLACE_WITH_REAL_SHARED_UID',uid)}
});
const db=env.authenticatedContext(uid,{email}).firestore();
const fleetRef=doc(db,'flottaSharedState','current');
const day='2099-05-19';
const bookingId=day+'__ABC123';
const claimId=day+'__DA0001';
const vehicleRef=doc(db,'vehicles','ABC123');
const driverRef=doc(db,'drivers','DA0001');

function makeFleet({vehicleStatus='aktiv',driverStatus='aktiv',eligibleDrivers,eligibleVehicles}={}){
  return {
    revision:1,migrationSourceSha256:sha,
    drivers:[{id:'original-d1',daCode:'DA0001',name:'CANONICAL DRIVER',
      agency:'SYNTHETIC',kapacitas:50,status:driverStatus,
      history:[{event:'Synthetic full history retained'}]}],
    vehicles:[{id:'original-v1',rendszam:'ABC-123',
      gyartmany:'Ford',modell:'Transit',status:vehicleStatus,
      history:[{event:'Synthetic full service history retained'}]}],
    fuelCards:[{id:'synthetic-fuel',history:[]}],
    contacts:[{id:'synthetic-contact',name:'SYNTHETIC CONTACT'}],
    eligibleDrivers:eligibleDrivers??(driverStatus==='aktiv'?['DA0001']:[]),
    eligibleVehicles:eligibleVehicles??(vehicleStatus==='aktiv'?['ABC123']:[])
  };
}
async function seed(fleet){
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async ctx=>{
    const elevated=ctx.firestore();
    await setDoc(doc(elevated,'users',uid),{
      name:'Synthetic internal admin',active:true,role:'admin'
    });
    await setDoc(doc(elevated,'flottaMigrationApproval','current'),{
      status:'approved',approvedUid:uid,sourceSha256:sha,
      approvedAt:Timestamp.fromDate(new Date('2026-01-01T00:00:00Z'))
    });
    await setDoc(doc(elevated,'flottaSharedState','current'),fleet);
    // These strict mirrors remain active and available in bypass scenarios.
    await setDoc(doc(elevated,'drivers','DA0001'),{
      daCode:'DA0001',name:'CANONICAL DRIVER',vendor:'SYNTHETIC',
      capacity:50,active:true
    });
    await setDoc(doc(elevated,'vehicles','ABC123'),{
      plate:'ABC123',model:'Ford Transit',status:'Elérhető'
    });
    await setDoc(doc(elevated,'driverCapacities','DA0001'),{capacity:50});
  });
}
async function checkAbsent(label){
  const [booking,claim]=await Promise.all([
    getDoc(doc(db,'bookings',bookingId)),
    getDoc(doc(db,'driverClaims',claimId))
  ]);
  assert.equal(booking.exists(),false,label+': booking must be absent');
  assert.equal(claim.exists(),false,label+': claim must be absent');
}
async function directSDKBooking(){
  const bookingRef=doc(db,'bookings',bookingId);
  const claimRef=doc(db,'driverClaims',claimId);
  return runTransaction(db,async tx=>{
    const [b,c]=await Promise.all([tx.get(bookingRef),tx.get(claimRef)]);
    assert.equal(b.exists(),false);
    assert.equal(c.exists(),false);
    tx.set(bookingRef,{
      date:day,vehicleId:'ABC123',driverId:'DA0001',
      district:'01',status:'planned',capacity:50
    });
    tx.set(claimRef,{date:day,driverId:'DA0001',bookingId});
    return true;
  });
}
async function appBooking(){
  return commitCanonicalDepotBooking({
    db,sdk:{doc,runTransaction},uid,getCurrentUid:()=>uid,
    offline:false,booking:{
      date:day,driverId:'DA0001',vehicleId:'ABC123',
      district:'01',status:'planned'
    }
  });
}
async function expectedDeny(label,fn,re){
  await assert.rejects(fn,e=>{
    assert.match(String(e?.message||e),re,label);
    return true;
  });
  await checkAbsent(label);
  console.log('PASS [E] EXPECTED DENY '+label);
}
try{
  // Server eligibility lists DO allow a legitimate synced booking.
  await seed(makeFleet());
  assert.equal((await appBooking()).committed,true);
  assert.equal((await getDoc(doc(db,'bookings',bookingId))).exists(),true);
  console.log('PASS [E] positive eligible original Fleet booking + claim');

  // A truly accurate eligibility list denies a canonical service vehicle.
  await seed(makeFleet({vehicleStatus:'szerviz'}));
  await expectedDeny('canonical service vehicle, accurate eligibleVehicles',
    directSDKBooking,/PERMISSION_DENIED|permission-denied/i);

  // A truly accurate eligibility list denies an inactive canonical driver.
  await seed(makeFleet({driverStatus:'inaktiv'}));
  await expectedDeny('canonical inactive driver, accurate eligibleDrivers',
    directSDKBooking,/PERMISSION_DENIED|permission-denied/i);

  // P0: browser can update the supposed proof list independently of the rich
  // original source, since Rules require only hasAll keys, not parity/type.
  // The canonical service car stays in status 'szerviz', but a raw SDK client
  // authorizes it by adding ABC123 to eligibleVehicles + revision bump.
  await seed(makeFleet({vehicleStatus:'szerviz'}));
  await updateDoc(fleetRef,{revision:2,eligibleVehicles:['ABC123']});
  const serviceFleet=(await getDoc(fleetRef)).data();
  assert.equal(serviceFleet.vehicles[0].status,'szerviz');
  assert.deepEqual(serviceFleet.eligibleVehicles,['ABC123']);
  await expectedDeny('normal app parity gate still sees service vehicle',
    appBooking,/BOOKING_BLOCKED: vehicle_depot_projection_drift|BOOKING_BLOCKED: ineligible_fleet_master/);
  assert.equal(await directSDKBooking(),true);
  assert.equal((await getDoc(doc(db,'bookings',bookingId))).exists(),true);
  console.log('PASS [E] P0 NO-GO forged eligibleVehicles authorizes canonical service car');

  await seed(makeFleet({driverStatus:'inaktiv'}));
  await updateDoc(fleetRef,{revision:2,eligibleDrivers:['DA0001']});
  const inactiveFleet=(await getDoc(fleetRef)).data();
  assert.equal(inactiveFleet.drivers[0].status,'inaktiv');
  assert.deepEqual(inactiveFleet.eligibleDrivers,['DA0001']);
  await expectedDeny('normal app parity gate still sees inactive driver',
    appBooking,/BOOKING_BLOCKED: driver_depot_projection_drift|BOOKING_BLOCKED: ineligible_fleet_master/);
  assert.equal(await directSDKBooking(),true);
  assert.equal((await getDoc(doc(db,'driverClaims',claimId))).exists(),true);
  console.log('PASS [E] P0 NO-GO forged eligibleDrivers authorizes canonical inactive driver');

  // An unrelated Master-only Fleet edit is permitted while strict mirror is stale.
  await seed(makeFleet());
  await updateDoc(fleetRef,{revision:2,drivers:[
    {...makeFleet().drivers[0],name:'CANONICAL NAME CHANGED'}
  ]});
  assert.equal((await getDoc(driverRef)).data().name,'CANONICAL DRIVER');
  await expectedDeny('solo Fleet rename still makes app booking deadlock',
    appBooking,/BOOKING_BLOCKED: driver_depot_projection_drift/);
  console.log('PASS [E] P0 NO-GO solo canonical Fleet update still deadlocks actual Depot booking');

  // Strict mirror writing is still server-permitted with any canonical revision
  // increment; eligibility lists do not protect mirror integrity.
  await seed(makeFleet());
  await runTransaction(db,async tx=>{
    const before=await tx.get(fleetRef);
    tx.update(fleetRef,{revision:before.data().revision+1});
    tx.set(driverRef,{
      daCode:'DA0001',name:'ATTACKER MIRROR',
      vendor:'SYNTHETIC',capacity:50,active:true
    });
  });
  assert.equal((await getDoc(driverRef)).data().name,'ATTACKER MIRROR');
  assert.equal((await getDoc(fleetRef)).data().drivers[0].name,'CANONICAL DRIVER');
  console.log('PASS [E] P0 NO-GO revision bump + forged strict mirror still server permitted');

  // Sanity: official normalized strict mirror still exists.
  assert.equal((await getDoc(vehicleRef)).data().plate,'ABC123');
  console.log('PASS REAL LOCAL emulator source-list bypass witnesses; no cloud or real data used. NO-GO');
}finally{
  await env.cleanup();
}
