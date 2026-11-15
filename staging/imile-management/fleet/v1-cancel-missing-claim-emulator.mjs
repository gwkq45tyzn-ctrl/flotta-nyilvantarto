/**
 * #156 Depot cancel: a booking whose driver claim is already gone must
 * still be releasable. The old cancel always deletes the claim document,
 * and Rules reject a delete of a missing claim, so the booking stays.
 * Synthetic emulator only.
 */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import {doc,getDoc,setDoc,runTransaction} from 'firebase/firestore';

const uid='synthetic-imile-v1-admin-0000001';
const email='imilemanagement@imile-management-staging.firebaseapp.com';
const rules=(await readFile(new URL(
  '../../../depokapacitas/firestore-v1-restricted.rules',import.meta.url),'utf8'))
  .replaceAll('REPLACE_WITH_REAL_SHARED_UID',uid);
const env=await initializeTestEnvironment({
  projectId:'demo-imile-restricted-v1',
  firestore:{host:'127.0.0.1',port:8787,rules}
});
const db=env.authenticatedContext(uid,{email}).firestore();
const bookingId='2099-04-01__ABC001';
const otherId='2099-04-02__ABC001';
const claimId='2099-04-01__DA0001';
function booking(date='2099-04-01'){
  return {date,driverId:'DA0001',vehicleId:'ABC001',district:'IX',
    status:'planned',capacity:70,driverIndex:0,vehicleIndex:0};
}
async function seed({claim}={}){
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async ctx=>{
    const admin=ctx.firestore();
    await setDoc(doc(admin,'users',uid),{active:true,role:'admin',name:'SYN'});
    await setDoc(doc(admin,'bookings',bookingId),booking());
    await setDoc(doc(admin,'bookings',otherId),booking('2099-04-02'));
    if(claim)await setDoc(doc(admin,'driverClaims',claimId),claim);
  });
}
const sdk={doc,runTransaction};
try{
  await seed();
  await assert.rejects(()=>runTransaction(db,async tx=>{
    const ref=doc(db,'bookings',bookingId);
    const row=await tx.get(ref);
    const data=row.data();
    tx.delete(ref);
    tx.delete(doc(db,'driverClaims',data.date+'__'+data.driverId));
  }),err=>err.code==='permission-denied');
  assert.equal((await getDoc(doc(db,'bookings',bookingId))).exists(),true);
  console.log('PASS DENY [E+SDK]: deleting a missing driver claim blocks the old cancel path');

  const {releaseCanonicalDepotBooking}=await import('../../../depokapacitas/canonical-booking-release.mjs');
  const release=()=>releaseCanonicalDepotBooking({
    db,sdk,offline:false,bookingId,claimCollection:'driverClaims'
  });
  await release();
  assert.equal((await getDoc(doc(db,'bookings',bookingId))).exists(),false);
  assert.equal((await getDoc(doc(db,'bookings',otherId))).exists(),true);
  console.log('PASS [E+SDK]: booking with no driver claim is released and the other day stays');

  await seed({claim:{date:'2099-04-01',driverId:'DA0001',bookingId}});
  await release();
  assert.equal((await getDoc(doc(db,'bookings',bookingId))).exists(),false);
  assert.equal((await getDoc(doc(db,'driverClaims',claimId))).exists(),false);
  console.log('PASS [E+SDK]: matching claim is deleted together with its booking');

  await seed({claim:{date:'2099-04-01',driverId:'DA0001',bookingId:otherId}});
  await assert.rejects(()=>release(),/claim_belongs_to_other_booking/);
  assert.equal((await getDoc(doc(db,'bookings',bookingId))).exists(),true);
  assert.equal((await getDoc(doc(db,'driverClaims',claimId))).data().bookingId,otherId);
  console.log('PASS DENY [E+SDK]: a claim owned by another booking is not deleted');

  let calls=0;
  await assert.rejects(()=>releaseCanonicalDepotBooking({
    db,sdk:{doc,runTransaction:(...args)=>{calls++;return runTransaction(...args);}},
    offline:true,bookingId,claimCollection:'driverClaims'
  }),/offline_or_unverified_network/);
  assert.equal(calls,0);
  console.log('PASS DENY [E+SDK]: offline cancel does not open a Firestore transaction');
}finally{
  await env.cleanup();
}
