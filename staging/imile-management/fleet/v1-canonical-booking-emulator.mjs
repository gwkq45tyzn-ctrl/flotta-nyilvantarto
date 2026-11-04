/**
 * ACTUAL Firebase Firestore emulator S7 BOOKING transaction QA (synthetic).
 * run via emulators:exec with --only firestore, demo project.
 * No real Auth, UID, data, network/cloud release or deployment.
 *
 * Tests the SAME commitCanonicalDepotBooking() imported by Depot app.js.
 * This tests one bounded booking and driverClaim transaction, NOT complete
 * Fleet + all mirrored master updates or live 2-PC production readiness.
 */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import {
  doc,getDoc,setDoc,updateDoc,runTransaction,Timestamp
} from 'firebase/firestore';
import {commitCanonicalDepotBooking} from '../../../depokapacitas/canonical-booking-transaction.mjs';

const projectId='demo-imile-restricted-v1';
const uid='synthetic-imile-v1-admin-0000001';
const unauthorizedUid='synthetic-other-user-0000002';
const email='imilemanagement@imile-management-staging.firebaseapp.com';
const digest='d'.repeat(64);
const raw=await readFile(new URL('../../../depokapacitas/firestore-v1-restricted.rules',import.meta.url),'utf8');
assert.match(raw,/REPLACE_WITH_REAL_SHARED_UID/);
const rules=raw.replaceAll('REPLACE_WITH_REAL_SHARED_UID',uid);
const env=await initializeTestEnvironment({
  projectId,firestore:{host:'127.0.0.1',port:8787,rules}
});
const shared=env.authenticatedContext(uid,{email}).firestore();
const sdk={doc,runTransaction};
let passed=0;

function fleet(){
  return {
    revision:1,migrationSourceSha256:digest,
    vehicles:[{id:'fleet-internal-vehicle',rendszam:'ABC-123',
      gyartmany:'Ford',modell:'Transit',status:'aktiv',
      history:[{type:'service',note:'NO REAL DATA'}]}],
    drivers:[{id:'fleet-local-driver',daCode:'DA0001',
      name:'Synthetic Internal Driver',agency:'SYNTHETIC',
      kapacitas:50,status:'aktiv',history:[{type:'assignment'}]}],
    fuelCards:[{id:'synthetic-card',history:[]}],
    contacts:[{id:'synthetic-contact'}]
  };
}
const approval={
  status:'approved',approvedUid:uid,sourceSha256:digest,
  approvedAt:Timestamp.fromDate(new Date('2026-01-01T00:00:00Z'))
};
const book=(date='2099-01-01',extra={})=>
  commitCanonicalDepotBooking({
    db:shared,sdk,uid,getCurrentUid:()=>uid,offline:false,
    booking:{date,driverId:'DA0001',vehicleId:'ABC123',
      district:'01',status:'planned'},
    ...extra
  });
async function shouldReject(label,callback,fragment){
  try{await callback();throw Error('UNEXPECTED SUCCESS: '+label);}
  catch(err){
    if(err.message?.startsWith('UNEXPECTED SUCCESS'))throw err;
    if(fragment)assert.match(String(err.message||err),fragment,label);
    console.log('PASS BLOCK '+label+': '+String(err.code||err.message).slice(0,130));
    passed++;
  }
}
async function seed(overrides={}){
  await env.withSecurityRulesDisabled(async ctx=>{
    const db=ctx.firestore();
    await setDoc(doc(db,'users',uid),{name:'SYNTHETIC ADMIN',active:true,role:'admin'});
    await setDoc(doc(db,'drivers','DA0001'),{
      name:'Synthetic Internal Driver',daCode:'DA0001',
      vendor:'SYNTHETIC',capacity:50,active:true
    });
    await setDoc(doc(db,'vehicles','ABC123'),{
      plate:'ABC123',model:'Ford Transit',status:'Elérhető'
    });
    await setDoc(doc(db,'driverCapacities','DA0001'),{capacity:50});
    if(overrides.fleet!==false)
      await setDoc(doc(db,'flottaSharedState','current'),overrides.fleetData||fleet());
    if(overrides.approval!==false)
      await setDoc(doc(db,'flottaMigrationApproval','current'),overrides.approvalData||approval);
  });
}
async function absence(date){
  for(const [collection,id]of [
    ['bookings',date+'__ABC123'],['driverClaims',date+'__DA0001']]){
    const snap=await getDoc(doc(shared,collection,id));
    assert.equal(snap.exists(),false,collection+' must remain absent: '+id);
  }
}

try{
  await seed({approval:false,fleet:false});
  await shouldReject('no privileged Fleet and policy cannot book',
    ()=>book('2099-01-01'),/BOOKING_BLOCKED: no_server_migration_approval/);
  await absence('2099-01-01');

  await seed();
  const approved=await book('2099-01-01');
  assert.equal(approved.committed,true,'Only actual runTransaction commit can return committed:true');
  assert.equal(approved.fleetRevision,1);
  const booked=await getDoc(doc(shared,'bookings','2099-01-01__ABC123'));
  const claim=await getDoc(doc(shared,'driverClaims','2099-01-01__DA0001'));
  assert.equal(booked.exists(),true);
  assert.equal(claim.exists(),true);
  assert.equal(booked.data().driverId,claim.data().driverId);
  assert.equal(claim.data().bookingId,'2099-01-01__ABC123');
  console.log('PASS [E]: actual committed canonical booking + driverClaim atomic pair');
  passed++;

  await shouldReject('same vehicle and driver cannot be booked twice',
    ()=>book('2099-01-01'),/BOOKING_BLOCKED: already_occupied/);

  // Same actual Firestore client, distinct concurrent transactions.
  const concurrent=await Promise.allSettled([
    book('2099-01-02'),book('2099-01-02')
  ]);
  assert.equal(concurrent.filter(x=>x.status==='fulfilled').length,1,
    'Exactly one concurrent same-slot booking must succeed');
  assert.equal(concurrent.filter(x=>x.status==='rejected').length,1);
  assert.equal((await getDoc(doc(shared,'bookings','2099-01-02__ABC123'))).exists(),true);
  assert.equal((await getDoc(doc(shared,'driverClaims','2099-01-02__DA0001'))).exists(),true);
  console.log('PASS [E]: concurrent clients cannot silently double-book');
  passed++;

  await env.withSecurityRulesDisabled(ctx=>
    updateDoc(doc(ctx.firestore(),'drivers','DA0001'),{name:'CORRUPTED MIRROR'}));
  await shouldReject('out-of-band Depot mirror drift is detected before write',
    ()=>book('2099-01-03'),/BOOKING_BLOCKED: driver_depot_projection_drift/);
  await absence('2099-01-03');
  await env.withSecurityRulesDisabled(ctx=>
    updateDoc(doc(ctx.firestore(),'drivers','DA0001'),{name:'Synthetic Internal Driver'}));

  await env.withSecurityRulesDisabled(ctx=>
    updateDoc(doc(ctx.firestore(),'flottaMigrationApproval','current'),{status:'revoked'}));
  await shouldReject('revoked server migration policy hard-stops booking',
    ()=>book('2099-01-04'),/BOOKING_BLOCKED: no_server_migration_approval/);
  await absence('2099-01-04');
  await env.withSecurityRulesDisabled(ctx=>
    updateDoc(doc(ctx.firestore(),'flottaMigrationApproval','current'),{status:'approved'}));

  await env.withSecurityRulesDisabled(ctx=>
    updateDoc(doc(ctx.firestore(),'flottaSharedState','current'),{migrationSourceSha256:'c'.repeat(64)}));
  await shouldReject('wrong original import SHA blocks booking',
    ()=>book('2099-01-05'),/BOOKING_BLOCKED: fleet_source_not_attested/);
  await absence('2099-01-05');
  await env.withSecurityRulesDisabled(ctx=>
    updateDoc(doc(ctx.firestore(),'flottaSharedState','current'),{migrationSourceSha256:digest}));

  await env.withSecurityRulesDisabled(ctx=>
    updateDoc(doc(ctx.firestore(),'users',uid),{role:'viewer'}));
  await shouldReject('remote role revocation must refuse actual booking writes',
    ()=>book('2099-01-06'),/permission-denied|Missing or insufficient permissions|PERMISSION_DENIED/i);
  await env.withSecurityRulesDisabled(ctx=>
    updateDoc(doc(ctx.firestore(),'users',uid),{role:'admin'}));
  await absence('2099-01-06');

  await shouldReject('client cannot claim online status without verification',
    ()=>book('2099-01-07',{offline:undefined}),/offline_or_unverified_network/);
  await shouldReject('browser auth changed before transaction',
    ()=>book('2099-01-08',{getCurrentUid:()=>unauthorizedUid}),/session_changed/);
  await absence('2099-01-07');
  await absence('2099-01-08');

  // P0 RELEASE-BLOCKER EVIDENCE: the existing restricted Rules allow a FULL
  // original Fleet master edit but correctly freeze standalone Depot mirrors.
  // This is deliberately a *positive demonstration of the defect*, not a
  // shipping workaround. Grok/Claude must design true one-source semantics.
  const originalSnapshot=(await getDoc(doc(shared,'flottaSharedState','current'))).data();
  const modifiedDrivers=structuredClone(originalSnapshot.drivers);
  modifiedDrivers[0].name='SYNTHETIC CHANGED IN ORIGINAL FLEET';
  await updateDoc(doc(shared,'flottaSharedState','current'),{
    revision:originalSnapshot.revision+1,drivers:modifiedDrivers
  });
  const driverEdited=(await getDoc(doc(shared,'flottaSharedState','current'))).data();
  assert.equal(driverEdited.drivers[0].name,'SYNTHETIC CHANGED IN ORIGINAL FLEET');
  assert.deepEqual(driverEdited.vehicles,originalSnapshot.vehicles);
  assert.deepEqual(driverEdited.fuelCards,originalSnapshot.fuelCards);
  assert.deepEqual(driverEdited.contacts,originalSnapshot.contacts);
  assert.deepEqual(driverEdited.drivers[0].history,originalSnapshot.drivers[0].history,
    'Rich original Fleet driver history must survive its master edit');
  await shouldReject('P0 master driver edit accepted by Fleet but Depot booking now blocked by stale mirror',
    ()=>book('2099-01-09'),/BOOKING_BLOCKED: driver_depot_projection_drift/);
  await absence('2099-01-09');
  await shouldReject('P0 browser cannot repair strict driver mirror outside approved architecture',
    ()=>updateDoc(doc(shared,'drivers','DA0001'),{
      name:'SYNTHETIC CHANGED IN ORIGINAL FLEET'
    }),/permission-denied|Missing or insufficient permissions|PERMISSION_DENIED/i);
  console.log('PASS [E] P0 NO-GO witness: Fleet committed driver edit, Depot cannot book and mirror cannot legally update');
  passed++;

  // A booked car is allowed to enter service in the original Fleet record
  // while its previously committed future booking remains. This is a
  // concrete occupancy/master-integrity issue that needs server-side design.
  const serviceVehicles=structuredClone(originalSnapshot.vehicles);
  serviceVehicles[0].status='szerviz';
  await updateDoc(doc(shared,'flottaSharedState','current'),{
    revision:driverEdited.revision+1,
    drivers:originalSnapshot.drivers,
    vehicles:serviceVehicles
  });
  const carEdited=(await getDoc(doc(shared,'flottaSharedState','current'))).data();
  assert.equal(carEdited.vehicles[0].status,'szerviz');
  assert.equal((await getDoc(doc(shared,'bookings','2099-01-01__ABC123'))).data()?.status,
    'planned','Previously committed future booking still exists for now-service car');
  await shouldReject('P0 Fleet car service edit causes old Depot vehicle projection mismatch',
    ()=>book('2099-01-10'),/BOOKING_BLOCKED: vehicle_depot_projection_drift/);
  await absence('2099-01-10');
  console.log('PASS [E] P0 NO-GO witness: in-service Fleet car retains existing future booking, new booking blocked by stale mirror');
  passed++;

  // Restore just synthetic ORIGINAL Fleet masters, without touching any
  // Depot mirror or external data. Its rich nonmaster fields stay unchanged.
  await updateDoc(doc(shared,'flottaSharedState','current'),{
    revision:carEdited.revision+1,
    drivers:originalSnapshot.drivers,vehicles:originalSnapshot.vehicles
  });
  const restored=(await getDoc(doc(shared,'flottaSharedState','current'))).data();
  assert.deepEqual(restored.vehicles,originalSnapshot.vehicles);
  assert.deepEqual(restored.drivers,originalSnapshot.drivers);
  assert.deepEqual(restored.fuelCards,originalSnapshot.fuelCards);
  assert.deepEqual(restored.contacts,originalSnapshot.contacts);
  assert.equal((await book('2099-01-11')).committed,true,
    'Only after a synthetic Fleet rollback to exact matching masters can booking resume');
  console.log('PASS [E] P0 NO-GO witness: restoring source master data reopens booking, but edit was never synchronized');
  passed++;

  console.log('PASS LOCAL EMULATOR canonical Depot actual transaction regression: '+passed+' verified cases (NO LIVE CLOUD)');
}finally{
  await env.cleanup();
}
