/**
 * #133 P0: FULL atomic authenticated SDK booking + all three required claims.
 * A bare setDoc(bookings) is always denied and PROVES NOTHING because the
 * restricted Rules require an atomic driverClaims + both identity claims.
 * This local signed-in emulator runs maliciously PRIVILEGED-SEEDED duplicates.
 * No cloud, actual credentials, or live data. Expected RED if duplicate source
 * can still be booked with client-selected indices and forged claims.
 */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import {doc,setDoc,writeBatch,getDoc,Timestamp} from 'firebase/firestore';

if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8787'
   && process.env.FIRESTORE_EMULATOR_HOST!=='localhost:8787')
  throw Error('LOCAL_EMULATOR_REQUIRED; refusing other target');
const projectId='demo-imile-restricted-v1',uid='synthetic-imile-v1-admin-0000001';
const email='imilemanagement@imile-management-staging.firebaseapp.com';
const sha='a'.repeat(64);
const rulesRaw=await readFile(new URL('../../../depokapacitas/firestore-v1-restricted.rules',import.meta.url),'utf8');
assert.match(rulesRaw,/REPLACE_WITH_REAL_SHARED_UID/);
const env=await initializeTestEnvironment({
  projectId,firestore:{host:'127.0.0.1',port:8787,
    rules:rulesRaw.replaceAll('REPLACE_WITH_REAL_SHARED_UID',uid)}
});
const client=env.authenticatedContext(uid,{email}).firestore();
const d1={id:'driver-1',daCode:'DA0001',status:'aktiv',kapacitas:80,
  name:'Synthetic One',history:[{type:'source',text:'keep'}]};
const v1={id:'vehicle-1',rendszam:'ABC-123',status:'aktiv',
  history:[{type:'source',text:'keep'}]};
const base=()=>({
  revision:1,sealed:true,migrationSourceSha256:sha,
  drivers:[structuredClone(d1)],vehicles:[structuredClone(v1)],
  fuelCards:[],contacts:[]
});
async function seed(source,{keyedStatus='aktiv'}={}){
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async context=>{
    const db=context.firestore();
    await setDoc(doc(db,'users',uid),{active:true,role:'admin',name:'SYNTHETIC'});
    await setDoc(doc(db,'flottaMigrationApproval','current'),{
      status:'approved',approvedUid:uid,sourceSha256:sha,
      approvedAt:Timestamp.fromDate(new Date('2026-01-01T00:00:00Z'))
    });
    await setDoc(doc(db,'flottaSharedState','current'),source);
    await setDoc(doc(db,'flottaDrivers','DA0001'),{
      ...d1,revision:1
    });
    await setDoc(doc(db,'flottaVehicles','ABC123'),{
      ...v1,status:keyedStatus,revision:1
    });
  });
}
function atomicBooking({
 date='2099-03-19',driverId='DA0001',vehicleId='ABC123',
 driverIndex=0,vehicleIndex=0,capacity=80,writeIdentityClaims=true
}={}){
  const bookingId=date+'__'+vehicleId,b=writeBatch(client);
  b.set(doc(client,'bookings',bookingId),{
    date,vehicleId,driverId,district:'IX',status:'planned',capacity,
    driverIndex,vehicleIndex
  });
  b.set(doc(client,'driverClaims',date+'__'+driverId),{
    date,driverId,bookingId
  });
  if(writeIdentityClaims){
    b.set(doc(client,'flottaDriverClaims',driverId),{
      sourceIndex:driverIndex,revision:1
    });
    b.set(doc(client,'flottaVehicleClaims',vehicleId),{
      sourceIndex:vehicleIndex,revision:1
    });
  }
  return b.commit();
}
const violations=[];
async function mustDeny(label,op){
  try{await op();violations.push(label);
      console.error('P0 VULNERABILITY: authenticated FULL ATOMIC booking ALLOWED '+label);
  }catch(err){if(err.code!=='permission-denied')throw err;
    console.log('PASS DENY [E+SDK] '+label);}
}
async function mustAllow(label,op){
  await op();
  console.log('PASS ALLOW [E+SDK] '+label);
}
try{
  await seed(base());
  await mustAllow('legal unique sealed keyed Fleet + all 3 claims, driverIndex 0 carIndex 0',
    ()=>atomicBooking());
  const confirmed=await getDoc(doc(client,'bookings','2099-03-19__ABC123'));
  assert.equal(confirmed.exists(),true,'full write must really persist');
  assert.equal(confirmed.data().capacity,80);

  // A lone booking write is indeed denied; this is a WRONG/WEAK probe,
  // not any actual proof of index validation.
  await seed(base());
  await mustDeny('bare booking without mandatory co-write (negative control)',
    ()=>setDoc(doc(client,'bookings','2099-03-20__ABC123'),{
      date:'2099-03-20',vehicleId:'ABC123',driverId:'DA0001',
      district:'IX',status:'planned',capacity:80,driverIndex:1,vehicleIndex:1
    }));

  // Completely different source identity at index 1 should be denied.
  const unrelated=base();
  unrelated.drivers.push({id:'d-other',daCode:'DA9999',status:'aktiv',kapacitas:500});
  unrelated.vehicles.push({id:'v-other',rendszam:'XYZ-999',status:'aktiv'});
  await seed(unrelated);
  await mustDeny('wrong indices point at OTHER identities despite forged client claims',
    ()=>atomicBooking({date:'2099-03-21',driverIndex:1,vehicleIndex:1}));

  // Deliberately corrupted privileged source. Keyed masters remain unique
  // and capacity/status authoritative, but a client may forge array indices
  // and all claim documents to select duplicate entries. No genuine trusted
  // migration preflight would approve this source; this is an ADVERSARIAL
  // defense-in-depth case for #133.
  const duplicateDrivers=base();
  duplicateDrivers.drivers.push({...d1,id:'forged-duplicate-driver',
    daCode:'da0001',kapacitas:500});
  await seed(duplicateDrivers);
  await mustDeny('duplicate normalized DA at original FIRST index with full claims',
    ()=>atomicBooking({date:'2099-03-22',driverIndex:0,vehicleIndex:0}));
  await seed(duplicateDrivers);
  await mustDeny('forged SECOND duplicate normalized DA index with FULL claims',
    ()=>atomicBooking({date:'2099-03-23',driverIndex:1,vehicleIndex:0}));
  await seed(duplicateDrivers);
  await mustDeny('forged duplicate DA index may not inflate keyed 80 capacity to 500',
    ()=>atomicBooking({date:'2099-03-24',driverIndex:1,capacity:500}));

  const duplicateVehicles=base();
  duplicateVehicles.vehicles.push({...v1,id:'forged-second-vehicle',
    rendszam:'ABC123',status:'szerviz'});
  await seed(duplicateVehicles);
  await mustDeny('duplicate normalized plate at original FIRST index with all claims',
    ()=>atomicBooking({date:'2099-03-25',driverIndex:0,vehicleIndex:0}));
  await seed(duplicateVehicles);
  await mustDeny('forged SECOND duplicate plate index even though archived second is in service',
    ()=>atomicBooking({date:'2099-03-26',driverIndex:0,vehicleIndex:1}));

  const both=base();
  both.drivers.push({...d1,id:'driver-duplicate-2'});
  both.vehicles.push({...v1,id:'plate-duplicate-2'});
  await seed(both);
  await mustDeny('BOTH forged SECOND duplicate identities with full client claims',
    ()=>atomicBooking({date:'2099-03-27',driverIndex:1,vehicleIndex:1}));

  // Live keyed service status still denies even a unique otherwise legal
  // signed-in booking, independent of the source archive status.
  await seed(base(),{keyedStatus:'szerviz'});
  await mustDeny('unique source but CURRENT keyed car in service',
    ()=>atomicBooking({date:'2099-03-28'}));

  assert.deepEqual(violations,[],
    'RELEASE P0 NO-GO: full atomic validated SDK booking allowed forged source indices: '+violations.join('; '));
  console.log('P0 #133 COMPLETE ACCEPTANCE PASS (all atomic hostile SDK negative cases denied and legal control allowed)');
}finally{await env.cleanup();}
