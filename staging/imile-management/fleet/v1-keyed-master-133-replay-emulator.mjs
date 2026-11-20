/**
 * Replays #133's FIVE authenticated direct-SDK attacks against the ACTUAL
 * full restricted iMile Rules AFTER both keyed canonical masters are seeded.
 *
 * A keyed master alone is not a protection if Rules authorize ambiguous
 * legacy arrays and an attacker can choose a duplicate index plus matching
 * index claim. We MUST DENY each attempt without weakening positive booking.
 *
 * Synthetic local Firestore emulator only. NO production resources.
 */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import {doc,getDoc,setDoc,updateDoc,writeBatch,Timestamp} from 'firebase/firestore';

const uid='synthetic-imile-v1-admin-0000001';
const email='imilemanagement@imile-management-staging.firebaseapp.com';
const sourceSha='f'.repeat(64);
const source=await readFile(
 new URL('../../../depokapacitas/firestore-v1-restricted.rules',import.meta.url),'utf8');
assert.match(source,/REPLACE_WITH_REAL_SHARED_UID/);
const env=await initializeTestEnvironment({
 projectId:'demo-imile-restricted-v1',
 firestore:{host:'127.0.0.1',port:8787,
  rules:source.replaceAll('REPLACE_WITH_REAL_SHARED_UID',uid)}
});
const db=env.authenticatedContext(uid,{email}).firestore();
const fleet=db=>doc(db,'flottaSharedState','current');
const newFleet=(revision=2)=>({
 revision,migrationSourceSha256:sourceSha,
 drivers:[{daCode:'TEST0001',status:'aktiv',kapacitas:50}],
 vehicles:[{rendszam:'TEST0001',normalizedPlate:'TEST0001',status:'aktiv'}],
 fuelCards:[],contacts:[]
});
async function setup(data=newFleet()){
 await env.clearFirestore();
 await env.withSecurityRulesDisabled(async ctx=>{
  const admin=ctx.firestore();
  await setDoc(doc(admin,'users',uid),
   {name:'SYNTHETIC ADMIN',active:true,role:'admin'});
  await setDoc(doc(admin,'flottaMigrationApproval','current'),{
   status:'approved',approvedUid:uid,sourceSha256:sourceSha,
   approvedAt:Timestamp.fromDate(new Date('2026-01-01T00:00:00Z'))
  });
  await setDoc(fleet(admin),data);
  // Canonical keys already existed before this direct SDK attack.
  await setDoc(doc(admin,'flottaDrivers','TEST0001'),{
   daCode:'TEST0001',kapacitas:50,status:'aktiv',
   name:'Existing migrated driver',history:[{note:'PRESERVE'}]
  });
  await setDoc(doc(admin,'flottaVehicles','TEST0001'),{
   rendszam:'TEST0001',status:'aktiv',modell:'Existing migrated car',
   history:[{note:'PRESERVE'}]
  });
 });
}
const failures=[];
async function mustDeny(label,action){
 try{
  await action();
  failures.push(label);
  console.error('P0 SECURITY BYPASS [E+SDK]: '+label);
 }catch(e){
  if(e.code!=='permission-denied')throw Error(
   'Unexpected error instead of Rules DENY on '+label+': '+e.message,{cause:e});
  console.log('PASS DENY [E+SDK] '+label);
 }
}
const book=(date,{capacity=50,driverIndex=0,vehicleIndex=0}={})=>{
 const vehicleId='TEST0001',driverId='TEST0001',bookingId=date+'__'+vehicleId;
 const batch=writeBatch(db);
 batch.set(doc(db,'bookings',bookingId),{
  date,vehicleId,driverId,district:'1',status:'planned',capacity,
  driverIndex,vehicleIndex
 });
 batch.set(doc(db,'driverClaims',date+'__'+driverId),{
  date,driverId,bookingId
 });
 // Spoofed index claims are submitted BY THE AUTHENTICATED ATTACKER.
 // If claim docs are missing, a DENY proves no identity protection.
 batch.set(doc(db,'flottaDriverClaims',driverId),
  {sourceIndex:driverIndex,revision:3});
 batch.set(doc(db,'flottaVehicleClaims',vehicleId),
  {sourceIndex:vehicleIndex,revision:3});
 return batch.commit();
};
try{
 // The original #133 direct SDK fixture uses revision=3 after hostile
 // seeding and claim revision must match that source version.
 await setup(newFleet(3));
 await book('2099-02-14');
 const positive=await getDoc(doc(db,'bookings','2099-02-14__TEST0001'));
 assert.equal(positive.exists(),true,
  'The valid unique-source booking MUST succeed to validate the attacker setup.');
 console.log('PASS ALLOW [E+SDK] unique keyed+legacy source creates valid booking');

 await setup(newFleet(2));
 await mustDeny('#133.1 direct SDK inserts identical DA twice',
  ()=>updateDoc(fleet(db),{revision:3,drivers:[
   {daCode:'TEST0001',status:'aktiv',kapacitas:50},
   {daCode:'TEST0001',status:'aktiv',kapacitas:500}
  ]}));
 await setup({...newFleet(3),drivers:[
  {daCode:'TEST0001',status:'aktiv',kapacitas:50},
  {daCode:'TEST0001',status:'aktiv',kapacitas:500}
 ]});
 await mustDeny('#133.2 forged second DA index books capacity 500',
  ()=>book('2099-02-16',{driverIndex:1,capacity:500}));

 await setup({...newFleet(3),drivers:[
  {daCode:'TEST0001',status:'aktiv',kapacitas:50},
  {daCode:'test0001',status:'aktiv',kapacitas:500}
 ]});
 await mustDeny('#133.3 mixed-case duplicate DA books first index',
  ()=>book('2099-02-17',{driverIndex:0,capacity:50}));

 await setup({...newFleet(3),vehicles:[
  {rendszam:'TEST0001',status:'szerviz',normalizedPlate:'TEST0001'},
  {rendszam:'TEST-0001',status:'aktiv',normalizedPlate:'TEST0001'}
 ]});
 await mustDeny('#133.4 second normalized plate bypasses first vehicle service',
  ()=>book('2099-02-18',{vehicleIndex:1,capacity:50}));

 await setup(newFleet(2));
 await mustDeny('#133.5 SDK inserts normalized duplicate vehicle plate',
  ()=>updateDoc(fleet(db),{revision:3,vehicles:[
   {rendszam:'TEST0001',status:'szerviz',normalizedPlate:'TEST0001'},
   {rendszam:'TEST-0001',status:'aktiv',normalizedPlate:'TEST0001'}
  ]}));

 assert.equal(failures.length,0,
  'RELEASE NO-GO: '+failures.length+
  ' of five original #133 authenticated SDK attacks were ALLOWED even with keyed masters present: '+
  failures.join(' | '));
 console.log('PASS: all five #133 authenticated direct SDK attempts denied by actual Rules');
}finally{
 await env.cleanup();
}
