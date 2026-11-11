/**
 * V1 P0/P1 real restricted Rules acceptance:
 * AFTER immutable trusted seal, canonical keyed Fleet master status/capacity
 * must determine booking eligibility, never the read-only legacy snapshot.
 *
 * Real signed-in Firestore SDK + original Depot transaction, local emulator.
 * No deploy / no real users or data. RED until Rules and transaction align.
 */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import {doc,getDoc,setDoc,updateDoc,writeBatch,Timestamp,runTransaction} from 'firebase/firestore';
import {commitCanonicalDepotBooking} from '../../../depokapacitas/canonical-booking-transaction.mjs';

const uid='synthetic-imile-v1-admin-0000001';
const email='imilemanagement@imile-management-staging.firebaseapp.com';
const digest='e'.repeat(64);
const source=await readFile(
 new URL('../../../depokapacitas/firestore-v1-restricted.rules',import.meta.url),'utf8');
assert.match(source,/REPLACE_WITH_REAL_SHARED_UID/);
const env=await initializeTestEnvironment({
 projectId:'demo-imile-restricted-v1',
 firestore:{host:'127.0.0.1',port:8787,
  rules:source.replaceAll('REPLACE_WITH_REAL_SHARED_UID',uid)}
});
const db=env.authenticatedContext(uid,{email}).firestore();
const sdk={doc,runTransaction};
const driverRef=doc(db,'flottaDrivers','DA0001');
const vehicleRef=doc(db,'flottaVehicles','ABC123');
const fleet=()=>({
 revision:1,migrationSourceSha256:digest,sealed:true,
 drivers:[{id:'original-driver',name:'Synthetic Driver',
  daCode:'DA0001',agency:'SYNTHETIC',status:'aktiv',
  kapacitas:50,history:[{note:'old sealed snapshot'}]}],
 vehicles:[{id:'original-car',rendszam:'ABC-123',normalizedPlate:'ABC123',
  gyartmany:'Ford',modell:'Transit',status:'aktiv',
  history:[{note:'old sealed snapshot'}]}],
 fuelCards:[],contacts:[]
});
async function reset(vehicleStatus='aktiv'){
 await env.clearFirestore();
 await env.withSecurityRulesDisabled(async ctx=>{
  const admin=ctx.firestore();
  await setDoc(doc(admin,'users',uid),
   {name:'SYNTHETIC ADMIN',role:'admin',active:true});
  await setDoc(doc(admin,'flottaMigrationApproval','current'),{
   status:'approved',approvedUid:uid,sourceSha256:digest,
   approvedAt:Timestamp.fromDate(new Date('2026-01-01T00:00:00Z'))
  });
  await setDoc(doc(admin,'flottaSharedState','current'),fleet());
  await setDoc(doc(admin,'flottaDrivers','DA0001'),{
   daCode:'DA0001',status:'aktiv',kapacitas:50,sourceIndex:0,
   name:'True canonical driver',history:[{note:'PRESERVE KEYED HISTORY'}]
  });
  await setDoc(doc(admin,'flottaVehicles','ABC123'),{
   rendszam:'ABC-123',status:vehicleStatus,sourceIndex:0,
   gyartmany:'Ford',modell:'Transit',
   history:[{note:'PRESERVE KEYED HISTORY'}]
  });
 });
}
const errors=[];
function directBook(date,capacity=50){
 const driverId='DA0001',vehicleId='ABC123';
 const bookingId=date+'__'+vehicleId;
 const batch=writeBatch(db);
 batch.set(doc(db,'bookings',bookingId),{
  date,driverId,vehicleId,district:'01',status:'planned',
  capacity,driverIndex:0,vehicleIndex:0
 });
 batch.set(doc(db,'driverClaims',date+'__'+driverId),{
  date,driverId,bookingId
 });
 // Only the date-scoped booking + reverse driver claim are client-writeable.
 // Source indexes are privileged and immutable fields of the keyed masters.
 return batch.commit();
}
async function actualBook(date){
 return commitCanonicalDepotBooking({
  db,sdk,uid,getCurrentUid:()=>uid,offline:false,
  booking:{date,driverId:'DA0001',vehicleId:'ABC123',
   district:'01',status:'planned'}
 });
}
try{
 // Positive control validates actual direct SDK attack setup.
 await reset('aktiv');
 await directBook('2099-04-01');
 assert.equal((await getDoc(doc(db,'bookings','2099-04-01__ABC123'))).exists(),true);
 console.log('PASS ALLOW [E+SDK] active canonical car + active archived car valid booking');

 // Keyed vehicle is serviced, but stale legacy snapshot remains "aktiv".
 // An authenticated direct SDK must NOT book a service vehicle.
 await reset('szerviz');
 try{
  await directBook('2099-04-02');
  const reason='P0 AUTHORIZED DIRECT SDK BOOKING with keyed canonical car STATUS SZERVIZ';
  errors.push(reason);console.error(reason);
 }catch(e){
  if(e.code!=='permission-denied')throw e;
  console.log('PASS DENY [E+SDK] trusted keyed service status blocks direct booking');
 }
 if((await getDoc(doc(db,'bookings','2099-04-02__ABC123'))).exists()){
  const reason='P0 service vehicle booking document persisted';
  errors.push(reason);console.error(reason);
 }

 // A legal original Fleet UI edit after seal changes keyed capacity, not the
 // immutable archived drivers[] array. The modular client must use 70 as the
 // CURRENT canonical capacity; validating against stale legacy 50 blocks
 // normal operations after real cutover.
 await reset('aktiv');
 await updateDoc(driverRef,{kapacitas:70});
 assert.equal((await getDoc(driverRef)).data().history[0].note,'PRESERVE KEYED HISTORY');
 console.log('PASS ALLOW [E+SDK] legitimate canonical keyed driver capacity update to 70');
 try{
  const result=await actualBook('2099-04-03');
  assert.equal(result.committed,true);
  const stored=(await getDoc(doc(db,'bookings','2099-04-03__ABC123'))).data();
  if(stored.capacity!==70){
   const reason='P1 WRONG CANONICAL BOOKING CAPACITY '+stored.capacity+' != 70';
   errors.push(reason);console.error(reason);
  }else console.log('PASS ALLOW [E+SDK] post-seal booking reflects current keyed driver capacity 70');
 }catch(e){
  const reason='P1 NORMAL POST-SEAL BOOKING DENIED after legal keyed driver capacity edit: '+
   (e.code||e.message);
  errors.push(reason);console.error(reason);
 }

 assert.equal(errors.length,0,
  'RELEASE NO-GO: '+errors.length+
  ' authenticated keyed authority/booking inconsistencies: '+errors.join(' || '));
 console.log('KEYED POST-SEAL BOOKING AUTHORITY ACCEPTANCE PASS');
}finally{
 await env.cleanup();
}
