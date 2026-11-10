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
  doc,getDoc,setDoc,updateDoc,deleteDoc,runTransaction,Timestamp
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
    vehicles:[{id:'fleet-internal-vehicle',rendszam:'ABC-123',normalizedPlate:'ABC123',
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
  const driverIdentityClaim=await getDoc(doc(shared,'flottaDriverClaims','DA0001'));
  const vehicleIdentityClaim=await getDoc(doc(shared,'flottaVehicleClaims','ABC123'));
  assert.equal(driverIdentityClaim.exists(),true,'Identity DA claim must be atomically created');
  assert.equal(vehicleIdentityClaim.exists(),true,'Identity vehicle claim must be atomically created');
  assert.deepEqual(driverIdentityClaim.data(),{sourceIndex:0,revision:1});
  assert.deepEqual(vehicleIdentityClaim.data(),{sourceIndex:0,revision:1});
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
  const mirrorDriftBooking=await book('2099-01-03');
  assert.equal(mirrorDriftBooking.committed,true,
    'The canonical Fleet driver remains bookable despite stale legacy mirror metadata');
  const mirrorBooked=await getDoc(doc(shared,'bookings','2099-01-03__ABC123'));
  assert.equal(mirrorBooked.exists(),true);
  console.log('PASS [E]: out-of-band legacy mirror cannot override approved canonical Fleet');
  await env.withSecurityRulesDisabled(ctx=>
    updateDoc(doc(ctx.firestore(),'drivers','DA0001'),{name:'Synthetic Internal Driver'}));

  // A real SDK transaction must also succeed with *no* Depot capacity or
  // driver mirror; original Fleet's kapacitas is the fallback source.
  await env.withSecurityRulesDisabled(async ctx=>{
    const db=ctx.firestore();
    await deleteDoc(doc(db,'driverCapacities','DA0001'));
    await deleteDoc(doc(db,'drivers','DA0001'));
  });
  const capacityFallback=await book('2099-01-09');
  assert.equal(capacityFallback.committed,true);
  const fallbackDoc=await getDoc(doc(shared,'bookings','2099-01-09__ABC123'));
  assert.equal(fallbackDoc.data().capacity,50);
  console.log('PASS [E]: canonical kapacitas fallback works without legacy driver mirror');
  passed++;
  await env.withSecurityRulesDisabled(async ctx=>{
    const db=ctx.firestore();
    await setDoc(doc(db,'driverCapacities','DA0001'),{capacity:50});
    await setDoc(doc(db,'drivers','DA0001'),{
      name:'Synthetic Internal Driver',daCode:'DA0001',
      vendor:'SYNTHETIC',capacity:50,active:true
    });
  });


  // REAL EMULATOR P1: a legitimate business DA code may contain ASCII '-'.
  // Rules validDriverCode() and shared-master-adapter.mjs allow the hyphen;
  // only vehicle PLATES strip it. The canonical booking adapter must not
  // incorrectly normalize a DA like a license plate and reject an eligible
  // courier with BOOKING_BLOCKED: duplicate_or_missing_driver.
  await env.withSecurityRulesDisabled(async ctx=>{
    const db=ctx.firestore();
    const expanded=fleet();
    expanded.drivers.push({
      id:'fleet-local-driver-hyphen',
      daCode:'DA-0002',name:'Synthetic Hyphen DA Driver',
      agency:'SYNTHETIC',kapacitas:70,status:'aktiv',
      history:[{type:'assignment',note:'synthetic'}]
    });
    await setDoc(doc(db,'flottaSharedState','current'),expanded);
  });
  const hyphenBooked=await commitCanonicalDepotBooking({
    db:shared,sdk,uid,getCurrentUid:()=>uid,offline:false,
    booking:{
      date:'2099-01-10',driverId:'DA-0002',vehicleId:'ABC123',
      district:'01',status:'planned'
    }
  });
  assert.equal(hyphenBooked.committed,true,
    'Valid ASCII hyphenated DA must book under Rules + canonical projection');
  const hyphenBooking=await getDoc(doc(shared,'bookings','2099-01-10__ABC123'));
  const hyphenClaim=await getDoc(doc(shared,'driverClaims','2099-01-10__DA-0002'));
  assert.equal(hyphenBooking.exists(),true);
  assert.equal(hyphenBooking.data().capacity,70);
  assert.equal(hyphenBooking.data().driverId,'DA-0002');
  assert.equal(hyphenClaim.data().bookingId,'2099-01-10__ABC123');
  const hyphenIdentityClaim=await getDoc(doc(shared,'flottaDriverClaims','DA-0002'));
  assert.equal(hyphenIdentityClaim.exists(),true,'Hyphenated DA must preserve the hyphen in claim ID');
  assert.deepEqual(hyphenIdentityClaim.data(),{sourceIndex:1,revision:1});
  assert.equal((await getDoc(doc(shared,'flottaDriverClaims','DA0002'))).exists(),false,
    'Stripped DA business identity must never be created');
  console.log('PASS [E]: legitimate hyphenated DA books exactly once and reserves its own claim');
  passed++;
  await env.withSecurityRulesDisabled(ctx=>
    setDoc(doc(ctx.firestore(),'flottaSharedState','current'),fleet()));

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
  console.log('PASS LOCAL EMULATOR canonical Depot actual transaction regression: '+passed+' verified cases (NO LIVE CLOUD)');
}finally{
  await env.cleanup();
}
