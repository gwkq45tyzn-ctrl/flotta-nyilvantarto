/**
 * ACTUAL Firestore SDK + LOCAL Rules Emulator evidence against Grok
 * grok/v1-s7-single-source, exact base 411bbad85d55637b38a7804c2e5fbcf25ad81bb9.
 *
 * A passing test means the unsafe condition was reproduced. It is NOT GO.
 * Synthetic UID, data, dates, and source SHA; no cloud access/deploy.
 */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import {doc,getDoc,setDoc,updateDoc,runTransaction,Timestamp} from 'firebase/firestore';
import {commitCanonicalDepotBooking} from '../../../depokapacitas/canonical-booking-transaction.mjs';

const uid='synthetic-imile-v1-admin-0000001';
const email='imilemanagement@imile-management-staging.firebaseapp.com';
const digest='a'.repeat(64);
const source=await readFile(
  new URL('../../../depokapacitas/firestore-v1-restricted.rules',import.meta.url),'utf8'
);
assert.ok(source.includes('REPLACE_WITH_REAL_SHARED_UID'),'Rules UID must be unreplaced');
const env=await initializeTestEnvironment({
  projectId:'demo-imile-restricted-v1',
  firestore:{host:'127.0.0.1',port:8787,
    rules:source.replaceAll('REPLACE_WITH_REAL_SHARED_UID',uid)}
});
const db=env.authenticatedContext(uid,{email}).firestore();
const fleetRef=doc(db,'flottaSharedState','current');
const driverRef=doc(db,'drivers','DA0001');
const vehicleRef=doc(db,'vehicles','ABC123');
const get = (collection,id)=>getDoc(doc(db,collection,id));
const date='2099-05-19';
const fleet=(overrides={})=>({
  revision:1,migrationSourceSha256:digest,
  drivers:[{id:'rich-driver',daCode:'DA0001',name:'CANONICAL DRIVER',
    agency:'SYNTHETIC',kapacitas:50,status:'aktiv',
    history:[{event:'SYNTHETIC ORIGINAL DRIVER HISTORY'}]}],
  vehicles:[{id:'rich-car',rendszam:'ABC-123',
    gyartmany:'Ford',modell:'Transit',status:'aktiv',
    history:[{event:'SYNTHETIC ORIGINAL SERVICE HISTORY'}]}],
  fuelCards:[{id:'test-fuel',history:[{amount:1}]}],
  contacts:[{id:'test-contact',name:'TEST ONLY'}],
  ...overrides
});
const driver=(name='CANONICAL DRIVER')=>({
  name,daCode:'DA0001',vendor:'SYNTHETIC',capacity:50,active:true
});
const vehicle=()=>({plate:'ABC123',model:'Ford Transit',status:'Elérhető'});
const docIds=()=>({
  booking:doc(db,'bookings',date+'__ABC123'),
  claim:doc(db,'driverClaims',date+'__DA0001')
});
const normalizedBooking={
  date,driverId:'DA0001',vehicleId:'ABC123',
  district:'01',status:'planned',capacity:50
};
async function seed(original=fleet()){
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async ctx=>{
    const elevated=ctx.firestore();
    await setDoc(doc(elevated,'users',uid),{
      name:'SYNTHETIC ADMIN',active:true,role:'admin'
    });
    await setDoc(doc(elevated,'flottaMigrationApproval','current'),{
      status:'approved',approvedUid:uid,sourceSha256:digest,
      approvedAt:Timestamp.fromDate(new Date('2026-01-01T00:00:00Z'))
    });
    await setDoc(doc(elevated,'flottaSharedState','current'),original);
    await setDoc(doc(elevated,'drivers','DA0001'),driver());
    await setDoc(doc(elevated,'vehicles','ABC123'),vehicle());
    await setDoc(doc(elevated,'driverCapacities','DA0001'),{capacity:50});
  });
}
async function bookThroughApp(){
  return commitCanonicalDepotBooking({
    db,sdk:{doc,runTransaction},uid,getCurrentUid:()=>uid,offline:false,
    booking:{date,driverId:'DA0001',vehicleId:'ABC123',
      district:'01',status:'planned'}
  });
}
async function directBooking(){
  const ids=docIds();
  return runTransaction(db,async tx=>{
    const [a,b]=await Promise.all([tx.get(ids.booking),tx.get(ids.claim)]);
    assert.equal(a.exists(),false);
    assert.equal(b.exists(),false);
    tx.set(ids.booking,normalizedBooking);
    tx.set(ids.claim,{date,driverId:'DA0001',bookingId:date+'__ABC123'});
    return true;
  });
}
async function denies(label,callback,expected){
  await assert.rejects(callback,e=>{
    assert.match(String(e.message||e),expected,label);
    return true;
  });
  console.log('PASS [E] expected browser hard-stop: '+label);
}
async function assertCommitted(){
  assert.equal((await getDoc(docIds().booking)).exists(),true);
  assert.equal((await getDoc(docIds().claim)).exists(),true);
}
try{
  // Baseline positive: intact shared source + mirrors can book correctly.
  await seed();
  assert.equal((await bookThroughApp()).committed,true);
  await assertCommitted();
  console.log('PASS [E] positive real adapter booking succeeds on matching source');

  // Important: the removed guard now permits ordinary no-master edits on
  // empty arrays. This fixes ONE past defect only; no ghost booking implied.
  await seed(fleet({drivers:[],vehicles:[]}));
  await updateDoc(fleetRef,{revision:2,contacts:[{id:'changed-test-contact'}]});
  assert.equal((await getDoc(fleetRef)).data().revision,2);
  console.log('PASS [E] empty original arrays contact edit works after guard removal');

  // A solo Fleet edit is ALLOWED and mirror is still old. Shipped app's
  // booking guard fails closed, so the Depot cannot operate until repaired.
  await seed();
  await updateDoc(fleetRef,{revision:2,drivers:[
    {...fleet().drivers[0],name:'RENAMED CANONICAL DRIVER'}
  ]});
  assert.equal((await getDoc(driverRef)).data().name,'CANONICAL DRIVER');
  await denies('normal Fleet edit leaves Depot mirror drift',
    bookThroughApp,/BOOKING_BLOCKED: driver_depot_projection_drift/);
  assert.equal((await getDoc(docIds().booking)).exists(),false);
  console.log('PASS [E] NO-GO normal Fleet solo edit makes adapter booking unusable');

  // A forged mirror update can still accompany an otherwise unrelated
  // canonical Fleet revision bump under Grok's restricted Rules.
  await seed();
  await runTransaction(db,async tx=>{
    const previous=await tx.get(fleetRef);
    tx.update(fleetRef,{revision:previous.data().revision+1});
    tx.set(driverRef,driver('FORGED MIRROR WITH CANONICAL UNCHANGED'));
  });
  assert.equal((await getDoc(fleetRef)).data().drivers[0].name,'CANONICAL DRIVER');
  assert.equal((await getDoc(driverRef)).data().name,
    'FORGED MIRROR WITH CANONICAL UNCHANGED');
  console.log('PASS [E] P0 server Rules ALLOW revision-bump forged mirror write');

  // CRITICAL: canonical Fleet marks vehicle out of service while strict
  // mirror stays 'Elérhető'. The original client SDK booking gate blocks,
  // but a direct authenticated SDK transaction can bypass that client check.
  await seed(fleet({vehicles:[{...fleet().vehicles[0],status:'szerviz'}]}));
  await denies('app rejects service car when mirror differs',
    bookThroughApp,/BOOKING_BLOCKED: vehicle_depot_projection_drift|BOOKING_BLOCKED: ineligible_fleet_master/);
  assert.equal(await directBooking(),true,
    'Rules alone currently permit booking the service car via strict mirror');
  await assertCommitted();
  console.log('PASS [E] P0 server Rules BYPASS: direct SDK booked canonical service car');

  // Symmetric test: canonical driver inactive, strict mirror says active.
  await seed(fleet({drivers:[{...fleet().drivers[0],status:'inaktiv'}]}));
  await denies('app rejects inactive canonical driver when mirror differs',
    bookThroughApp,/BOOKING_BLOCKED: driver_depot_projection_drift|BOOKING_BLOCKED: ineligible_fleet_master/);
  assert.equal(await directBooking(),true);
  await assertCommitted();
  console.log('PASS [E] P0 server Rules BYPASS: direct SDK booked canonical inactive driver');

  console.log('PASS REAL LOCAL S7 single-source adversarial witnesses; each P0 issue remains NO-GO');
}finally{
  await env.cleanup();
}
