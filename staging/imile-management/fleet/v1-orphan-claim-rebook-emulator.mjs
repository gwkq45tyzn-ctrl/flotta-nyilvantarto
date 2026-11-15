/**
 * A driverClaims row whose booking document is already gone must not
 * block a new Depot booking. The live pair still blocks. Synthetic only.
 */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import {doc,getDoc,setDoc,updateDoc,runTransaction,Timestamp} from 'firebase/firestore';
import {commitCanonicalDepotBooking} from '../../../depokapacitas/canonical-booking-transaction.mjs';

const uid='synthetic-imile-v1-admin-0000001';
const email='imilemanagement@imile-management-staging.firebaseapp.com';
const digest='d'.repeat(64);
const rules=(await readFile(new URL(
  '../../../depokapacitas/firestore-v1-restricted.rules',import.meta.url),'utf8'))
  .replaceAll('REPLACE_WITH_REAL_SHARED_UID',uid);
const env=await initializeTestEnvironment({
  projectId:'demo-imile-restricted-v1',
  firestore:{host:'127.0.0.1',port:8787,rules}
});
const db=env.authenticatedContext(uid,{email}).firestore();
const sdk={doc,runTransaction};
const date='2099-06-01';
function book(vehicleId='ABC123'){
  return commitCanonicalDepotBooking({
    db,sdk,uid,getCurrentUid:()=>uid,offline:false,
    booking:{date,driverId:'DA0001',vehicleId,district:'01',status:'planned'}
  });
}
async function seed({claim,booking}={}){
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async ctx=>{
    const admin=ctx.firestore();
    await setDoc(doc(admin,'users',uid),{name:'SYN',active:true,role:'admin'});
    await setDoc(doc(admin,'flottaMigrationApproval','current'),{
      status:'approved',approvedUid:uid,sourceSha256:digest,
      approvedAt:Timestamp.fromDate(new Date('2026-01-01T00:00:00Z'))
    });
    await setDoc(doc(admin,'flottaSharedState','current'),{
      revision:1,migrationSourceSha256:digest,sealed:true,
      vehicles:[{id:'fleet-internal-vehicle',rendszam:'ABC-123',normalizedPlate:'ABC123',
        gyartmany:'Ford',modell:'Transit',status:'aktiv',
        history:[{type:'service',note:'NO REAL DATA'}]}],
      drivers:[{id:'fleet-local-driver',daCode:'DA0001',
        name:'Synthetic Internal Driver',agency:'SYNTHETIC',
        kapacitas:50,status:'aktiv',history:[{type:'assignment'}]}],
      fuelCards:[{id:'synthetic-card',history:[]}],
      contacts:[{id:'synthetic-contact'}]
    });
    await setDoc(doc(admin,'flottaDrivers','DA0001'),{
      daCode:'DA0001',status:'aktiv',kapacitas:50,sourceIndex:0,
      name:'Migrated Driver',history:[{type:'onboarding',note:'PRESERVE'}]
    });
    await setDoc(doc(admin,'flottaVehicles','ABC123'),{
      rendszam:'ABC-123',status:'aktiv',sourceIndex:0,gyartmany:'Ford',modell:'Transit',
      history:[{type:'service',note:'PRESERVE'}]
    });
    if(claim)await setDoc(doc(admin,'driverClaims',date+'__DA0001'),claim);
    if(booking)await setDoc(doc(admin,'bookings',booking.id),booking.data);
  });
}
try{
  await seed({claim:{date,driverId:'DA0001',bookingId:date+'__ABC123'}});
  await book();
  assert.equal((await getDoc(doc(db,'bookings',date+'__ABC123'))).exists(),true);
  assert.equal((await getDoc(doc(db,'driverClaims',date+'__DA0001'))).data().bookingId,
    date+'__ABC123');
  console.log('PASS [E+SDK]: a matching claim whose booking is gone can be booked again');

  await seed({claim:{date,driverId:'DA0001',bookingId:date+'__ZZZ999'}});
  await book();
  const replaced=(await getDoc(doc(db,'driverClaims',date+'__DA0001'))).data();
  assert.equal(replaced.bookingId,date+'__ABC123');
  assert.equal((await getDoc(doc(db,'bookings',date+'__ABC123'))).exists(),true);
  assert.equal((await getDoc(doc(db,'bookings',date+'__ZZZ999'))).exists(),false);
  console.log('PASS [E+SDK]: a stale claim pointing at a missing booking is replaced');

  await seed({
    claim:{date,driverId:'DA0001',bookingId:date+'__ABC123'},
    booking:{id:date+'__ABC123',data:{
      date,driverId:'DA0001',vehicleId:'ABC123',district:'01',status:'planned',
      capacity:50,driverIndex:0,vehicleIndex:0
    }}
  });
  await assert.rejects(()=>book(),/already_occupied/);
  assert.equal((await getDoc(doc(db,'bookings',date+'__ABC123'))).exists(),true);
  assert.equal((await getDoc(doc(db,'driverClaims',date+'__DA0001'))).data().bookingId,
    date+'__ABC123');
  console.log('PASS DENY [E+SDK]: a live booking and its claim still block a second booking');
  await assert.rejects(()=>updateDoc(doc(db,'driverClaims',date+'__DA0001'),{
    date,driverId:'DA0001',bookingId:date+'__ABC999'
  }),err=>err.code==='permission-denied');
  assert.equal((await getDoc(doc(db,'driverClaims',date+'__DA0001'))).data().bookingId,
    date+'__ABC123');
  console.log('PASS DENY [E+SDK]: a live claim cannot be pointed at another booking');
}finally{
  await env.cleanup();
}
