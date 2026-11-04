/**
 * Independent S7 second pass on Grok #114 @ 0c3f8f774075ec9d5879c776e5c9ef06f5c30a7d.
 * REAL Firebase SDK + REAL Rules Emulator; no live credentials, deploy or data.
 * All records are synthetic. "BUG reproduced" PASS is explicitly NO-GO.
 */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import {doc,getDoc,setDoc,updateDoc,runTransaction,Timestamp} from 'firebase/firestore';
import {commitCanonicalDepotBooking} from '../../../depokapacitas/canonical-booking-transaction.mjs';
import {assessCanonicalMasterDisplay} from '../../../depokapacitas/canonical-source-health.mjs';

const uid='synthetic-imile-v1-admin-0000001';
const email='imilemanagement@imile-management-staging.firebaseapp.com';
const sha='f'.repeat(64);
const ruleText=await readFile(new URL('../../../depokapacitas/firestore-v1-restricted.rules',import.meta.url),'utf8');
assert.ok(ruleText.includes('REPLACE_WITH_REAL_SHARED_UID'),'no live UID in QA');
const env=await initializeTestEnvironment({
  projectId:'demo-imile-restricted-v1',
  firestore:{host:'127.0.0.1',port:8787,
    rules:ruleText.replaceAll('REPLACE_WITH_REAL_SHARED_UID',uid)}
});
const db=env.authenticatedContext(uid,{email}).firestore();
const fleetRef=doc(db,'flottaSharedState','current');
const day='2099-06-15';
const driverRef=doc(db,'drivers','DA0001');
const carRef=doc(db,'vehicles','ABC123');
const approvalRef=doc(db,'flottaMigrationApproval','current');
const bookingRef=id=>doc(db,'bookings',day+'__'+id);
const claimRef=doc(db,'driverClaims',day+'__DA0001');

function fleet({normalized='ABC123',raw='ABC-123',status='aktiv',
                 driverStatus='aktiv',dupe=false,omitNormalized=false}={}){
  const vehicle={
    id:'orig-car1',rendszam:raw,gyartmany:'Ford',modell:'Transit',
    status,history:[{event:'synthetic service history'}],
    ...(omitNormalized?{}:{normalizedPlate:normalized})
  };
  const driver={
    id:'orig-driver1',daCode:'DA0001',name:'ORIGINAL DRIVER',
    agency:'SYNTHETIC',kapacitas:50,status:driverStatus,
    history:[{event:'synthetic assignment history'}]
  };
  return {
    revision:1,migrationSourceSha256:sha,
    vehicles:dupe?[vehicle,{...vehicle,id:'orig-car2',status:'szerviz'}]:[vehicle],
    drivers:dupe?[driver,{...driver,id:'orig-driver2',status:'inaktiv'}]:[driver],
    fuelCards:[{id:'synthetic-fuel',history:[]}],
    contacts:[{id:'synthetic-contact',name:'SYNTHETIC'}]
  };
}
async function seed(current){
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async ctx=>{
    const elevated=ctx.firestore();
    await setDoc(doc(elevated,'users',uid),{
      name:'SYNTHETIC ADMIN',active:true,role:'admin'
    });
    await setDoc(doc(elevated,'flottaMigrationApproval','current'),{
      status:'approved',approvedUid:uid,sourceSha256:sha,
      approvedAt:Timestamp.fromDate(new Date('2026-01-01T00:00:00Z'))
    });
    await setDoc(doc(elevated,'flottaSharedState','current'),current);
    await setDoc(doc(elevated,'drivers','DA0001'),{
      daCode:'DA0001',name:'ORIGINAL DRIVER',
      vendor:'SYNTHETIC',capacity:50,active:true
    });
    for(const plate of ['ABC123','XYZ999'])
      await setDoc(doc(elevated,'vehicles',plate),{
        plate,model:'Ford Transit',status:'Elérhető'
      });
    await setDoc(doc(elevated,'driverCapacities','DA0001'),{capacity:50});
  });
}
async function actualAppBooking(id='ABC123'){
  return commitCanonicalDepotBooking({
    db,sdk:{doc,runTransaction},uid,getCurrentUid:()=>uid,offline:false,
    booking:{date:day,driverId:'DA0001',vehicleId:id,
      district:'01',status:'planned'}
  });
}
async function rawSDKBooking({id='ABC123',index=0,driverIndex=0,
                             mutateFleet=null}={}){
  return runTransaction(db,async tx=>{
    const b=bookingRef(id);
    const [beforeBook,beforeClaim,original]=await Promise.all([
      tx.get(b),tx.get(claimRef),tx.get(fleetRef)
    ]);
    assert.equal(beforeBook.exists(),false);
    assert.equal(beforeClaim.exists(),false);
    if(mutateFleet)
      tx.update(fleetRef,mutateFleet(original.data()));
    tx.set(b,{date:day,driverId:'DA0001',vehicleId:id,
      district:'01',status:'planned',capacity:50,
      driverIndex,vehicleIndex:index});
    tx.set(claimRef,{date:day,driverId:'DA0001',bookingId:day+'__'+id});
    return true;
  });
}
async function expectedDeny(label,task,re=/PERMISSION_DENIED|permission-denied/i){
  await assert.rejects(task,error=>{
    assert.match(String(error?.message||error),re,label);
    return true;
  });
  console.log('PASS [E] DENY '+label);
}
async function assertNoBooking(id='ABC123'){
  assert.equal((await getDoc(bookingRef(id))).exists(),false);
  assert.equal((await getDoc(claimRef)).exists(),false);
}
try{
  // Legitimate normalized-plate booking must work with REAL original app adapter.
  await seed(fleet());
  assert.equal((await actualAppBooking()).committed,true);
  assert.equal((await getDoc(bookingRef('ABC123'))).exists(),true);
  console.log('PASS [E] legitimate original ABC-123 -> ABC123 app booking');

  await seed(fleet({status:'szerviz'}));
  await expectedDeny('canonical service car raw SDK',rawSDKBooking);
  await assertNoBooking();

  await seed(fleet({driverStatus:'inaktiv'}));
  await expectedDeny('canonical inactive driver raw SDK',rawSDKBooking);
  await assertNoBooking();

  // Genuine getAfter regression: the effective post-transaction master is service.
  await seed(fleet());
  await expectedDeny('same transaction activates service and creates booking',
    ()=>rawSDKBooking({mutateFleet:old=>({
      revision:old.revision+1,
      vehicles:[{...old.vehicles[0],status:'szerviz'}]
    })}));
  await assertNoBooking();
  console.log('PASS [E] getAfter now prevents same-transaction service+booking');

  // PROVEN P0 AUTHORITY GAP: client can forge normalizedPlate field without
  // changing original plate. Rules only see a matching normalizedPlate.
  await seed(fleet());
  await updateDoc(fleetRef,{
    revision:2,
    vehicles:[{...fleet().vehicles[0],normalizedPlate:'XYZ999'}]
  });
  const forged=(await getDoc(fleetRef)).data();
  assert.equal(forged.vehicles[0].rendszam,'ABC-123');
  assert.equal(forged.vehicles[0].normalizedPlate,'XYZ999');
  await expectedDeny('actual app correctly rejects nonexistent original XYZ999 master',
    ()=>actualAppBooking('XYZ999'),/BOOKING_BLOCKED: booking_master_not_in_original_fleet/);
  assert.equal(await rawSDKBooking({id:'XYZ999'}),true);
  assert.equal((await getDoc(bookingRef('XYZ999'))).exists(),true);
  console.log('PASS [E] P0 BUG direct SDK booked different plate via FORGED normalizedPlate');

  // The same canonical source is not validated for uniqueness at Rules level.
  await seed(fleet({dupe:true}));
  assert.equal(await rawSDKBooking(),true);
  assert.equal((await getDoc(bookingRef('ABC123'))).exists(),true);
  console.log('PASS [E] P0 BUG duplicate original DA/plate permitted by raw SDK');

  // Existing privileged import may have original Fleet docs without the newly
  // invented normalizedPlate field. No Fleet save means valid car is blocked.
  await seed(fleet({omitNormalized:true}));
  await expectedDeny('previous imported valid original Fleet lacks normalizedPlate',
    rawSDKBooking);
  await assertNoBooking();
  console.log('PASS [E] P0 BUG legacy imported Fleet cannot book until rewritten');

  // Bridge no longer synchronizes strict mirrors, but BOTH original display
  // and real transaction still require their full parity. A valid edit freezes UI.
  await seed(fleet());
  const nextDriver={...fleet().drivers[0],name:'NEW VALID ORIGINAL DRIVER NAME'};
  await updateDoc(fleetRef,{revision:2,drivers:[nextDriver]});
  assert.equal((await getDoc(driverRef)).data().name,'ORIGINAL DRIVER');
  await expectedDeny('normal edited original master cannot book because mirror stays stale',
    actualAppBooking,/BOOKING_BLOCKED: driver_depot_projection_drift/);
  await assertNoBooking();
  const t=Date.now();
  const sourceMeta=Object.fromEntries(
    ['drivers','vehicles','flottaSharedState','flottaMigrationApproval']
      .map(x=>[x,{loaded:true,error:false,fromCache:false,pending:false,serverAt:t}])
  );
  const display=assessCanonicalMasterDisplay({
    fleet:(await getDoc(fleetRef)).data(),
    approval:(await getDoc(approvalRef)).data(),uid,
    driverMirrors:[{id:'DA0001',...(await getDoc(driverRef)).data()}],
    vehicleMirrors:[{id:'ABC123',...(await getDoc(carRef)).data()}],
    sourceMeta,online:true,now:t
  });
  assert.equal(display.trusted,false);
  assert.equal(display.reason,'depot_mirror_drift');
  console.log('PASS [E+T] P0 BUG legitimate Fleet edit freezes existing Depot display+booking');

  console.log('PASS REAL local S7 second-pass synthetic security witnesses. Overall NO-GO.');
}finally{
  await env.cleanup();
}
