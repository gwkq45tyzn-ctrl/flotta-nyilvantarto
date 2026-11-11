/**
 * #135 DA-code normalization after #133 privileged keyed source-index cutover.
 * ASCII DA business keys preserve hyphens and underscores: DA-0002 ≠ DA0002.
 * Real signed-in original Depot booking on FULL restricted Firestore Rules,
 * local synthetic emulator only, NO real user data or cloud migration.
 */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import {doc,getDoc,setDoc,runTransaction,Timestamp} from 'firebase/firestore';
import {commitCanonicalDepotBooking} from '../../../depokapacitas/canonical-booking-transaction.mjs';

const uid='synthetic-imile-v1-admin-0000001';
const email='imilemanagement@imile-management-staging.firebaseapp.com';
const digest='d'.repeat(64);
const raw=await readFile(new URL('../../../depokapacitas/firestore-v1-restricted.rules',import.meta.url),'utf8');
assert.match(raw,/REPLACE_WITH_REAL_SHARED_UID/);
const env=await initializeTestEnvironment({
 projectId:'demo-imile-restricted-v1',
 firestore:{host:'127.0.0.1',port:8787,
 rules:raw.replaceAll('REPLACE_WITH_REAL_SHARED_UID',uid)}
});
const db=env.authenticatedContext(uid,{email}).firestore();
const ref=(col,id)=>doc(db,col,id);
const failures=[];
async function deny(label,action){
 try{await action();failures.push('FORBIDDEN CLIENT WRITE ALLOWED '+label);console.error(failures.at(-1))}
 catch(e){if(e.code!=='permission-denied')throw e;console.log('PASS DENY [E+SDK] '+label)}
}
async function allowBooking(driverId,date,capacity){
 try{
  const result=await commitCanonicalDepotBooking({
   db,sdk:{doc,runTransaction},uid,getCurrentUid:()=>uid,offline:false,
   booking:{date,driverId,vehicleId:'ABC123',district:'IX',status:'planned'}
  });
  assert.equal(result.committed,true);
  const b=await getDoc(ref('bookings',date+'__ABC123'));
  const c=await getDoc(ref('driverClaims',date+'__'+driverId));
  assert.equal(b.exists(),true);
  assert.equal(c.exists(),true);
  assert.equal(b.data().capacity,capacity);
  assert.equal(b.data().driverId,driverId);
  assert.equal(c.data().driverId,driverId);
  console.log('PASS ALLOW [E+SDK] real signed-in, canonical DA booking '+driverId);
 }catch(e){failures.push('LEGAL DA BOOKING DENIED '+driverId+' '+String(e.code||e.message||e));console.error(failures.at(-1))}
}
try{
 await env.withSecurityRulesDisabled(async ctx=>{
  const admin=ctx.firestore();
  await setDoc(doc(admin,'users',uid),{name:'SYNTHETIC ADMIN',active:true,role:'admin'});
  await setDoc(doc(admin,'flottaMigrationApproval','current'),{
   status:'approved',approvedUid:uid,sourceSha256:digest,
   approvedAt:Timestamp.fromDate(new Date('2026-01-01T00:00:00Z'))
  });
  await setDoc(doc(admin,'flottaSharedState','current'),{
   revision:1,sealed:true,migrationSourceSha256:digest,
   vehicles:[{id:'synthetic-vehicle',rendszam:'ABC-123',normalizedPlate:'ABC123',status:'aktiv'}],
   drivers:[
    {id:'synthetic-da1',daCode:'DA0001',status:'aktiv',kapacitas:50},
    {id:'synthetic-da2',daCode:'DA-0002',status:'aktiv',kapacitas:70},
    {id:'synthetic-da3',daCode:'DA_0003',status:'aktiv',kapacitas:80}
   ],fuelCards:[],contacts:[]
  });
  for(const [id,sourceIndex,capacity] of [
   ['DA0001',0,50],['DA-0002',1,70],['DA_0003',2,80]
  ])await setDoc(doc(admin,'flottaDrivers',id),{
   daCode:id,status:'aktiv',kapacitas:capacity,sourceIndex,
   revision:1,history:[{kind:'synthetic-import'}]
  });
  await setDoc(doc(admin,'flottaVehicles','ABC123'),{
   rendszam:'ABC-123',status:'aktiv',sourceIndex:0,
   revision:1,history:[{kind:'synthetic-import'}]
  });
 });
 // Client-manufactured source identity proof is always FORBIDDEN for ALL
 // DA formats; provenance is guaranteed by the privileged keyed master.
 for(const [col,id,sourceIndex] of [
   ['flottaDriverClaims','DA0001',0],
   ['flottaDriverClaims','DA-0002',1],
   ['flottaDriverClaims','DA_0003',2],
   ['flottaVehicleClaims','ABC123',0],
   ['flottaDriverClaims','DA0002',1]
 ])await deny('no browser identity claim '+col+'/'+id,
  ()=>setDoc(ref(col,id),{sourceIndex,revision:1}));
 // Actual legal authenticated canonical bookings MUST ALLOW, including
 // punctuation-preserving DA keys, with no alias to stripped key.
 await allowBooking('DA0001','2099-05-01',50);
 await allowBooking('DA-0002','2099-05-02',70);
 await allowBooking('DA_0003','2099-05-03',80);
 assert.equal((await getDoc(ref('bookings','2099-05-02__ABC123'))).data().driverId,'DA-0002');
 assert.equal((await getDoc(ref('bookings','2099-05-03__ABC123'))).data().driverId,'DA_0003');
 assert.equal(failures.length,0,'#135 DA business key regression: '+failures.join(' | '));
 console.log('PASS #135: real signed-in bookings preserve DA hyphen and underscore; privileged source indexes cannot be spoofed');
}finally{await env.cleanup()}
