/**
 * RED-team release acceptance on the FULL iMile restricted Rules and the
 * actual canonical-booking-transaction imported by the Depot UI.
 *
 * Two hard invariants:
 * 1. Booking must NEVER overwrite a trusted migrated keyed Fleet master,
 *    losing history, metadata, fields or original identity.
 * 2. Missing keyed canonical masters must BLOCK booking. A booking operation
 *    must NOT create its own allegedly authoritative records.
 *
 * Local Firebase Firestore emulator + synthetic data only. This test MUST
 * exit nonzero on actual violations, not turn known failure into "PASS".
 */
import assert from 'node:assert/strict';
import {isDeepStrictEqual} from 'node:util';
import {readFile} from 'node:fs/promises';
import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import {doc,getDoc,setDoc,Timestamp,runTransaction} from 'firebase/firestore';
import {commitCanonicalDepotBooking} from '../../../depokapacitas/canonical-booking-transaction.mjs';

const uid='synthetic-imile-v1-admin-0000001';
const email='imilemanagement@imile-management-staging.firebaseapp.com';
const digest='d'.repeat(64);
const raw=await readFile(new URL('../../../depokapacitas/firestore-v1-restricted.rules',import.meta.url),'utf8');
assert.match(raw,/REPLACE_WITH_REAL_SHARED_UID/);
const rules=raw.replaceAll('REPLACE_WITH_REAL_SHARED_UID',uid);
const env=await initializeTestEnvironment({
  projectId:'demo-imile-restricted-v1',
  firestore:{host:'127.0.0.1',port:8787,rules}
});
const db=env.authenticatedContext(uid,{email}).firestore();
const sdk={doc,runTransaction};
const driverMaster={
  daCode:'DA0001',status:'aktiv',kapacitas:50,
  name:'Rich driver with original history',
  agency:'SYNTHETIC',
  contact:{name:'Synthetic contact',number:'NO_REAL_NUMBER'},
  history:[{type:'onboarding',note:'must survive booking'}],
  revision:11
};
const vehicleMaster={
  rendszam:'ABC-123',status:'aktiv',
  gyartmany:'Ford',modell:'Transit',
  extra:{year:2024,lastService:'2098-12-03'},
  history:[{type:'service',note:'must survive booking'}],
  revision:7
};
const sourceFleet=()=>({
  revision:1,migrationSourceSha256:digest,sealed:true,
  vehicles:[{
    id:'vehicle-1',rendszam:'ABC-123',normalizedPlate:'ABC123',
    gyartmany:'Ford',modell:'Transit',status:'aktiv',
    history:[{type:'service',note:'must survive original Fleet'}]
  }],
  drivers:[{
    id:'driver-1',daCode:'DA0001',name:'Synthetic driver',
    agency:'SYNTHETIC',kapacitas:50,status:'aktiv',
    history:[{type:'assignment',note:'must survive original Fleet'}]
  }],
  fuelCards:[{id:'fuel-1',history:[{note:'original'}]}],
  contacts:[{id:'contact-1',name:'Original contact'}]
});
const approval={
  status:'approved',approvedUid:uid,sourceSha256:digest,
  approvedAt:Timestamp.fromDate(new Date('2026-01-01T00:00:00Z'))
};
const keyDriver=()=>doc(db,'flottaDrivers','DA0001');
const keyVehicle=()=>doc(db,'flottaVehicles','ABC123');
const errors=[];
const booking=async(date)=>commitCanonicalDepotBooking({
  db,sdk,uid,getCurrentUid:()=>uid,offline:false,
  booking:{date,driverId:'DA0001',vehicleId:'ABC123',
    district:'01',status:'planned'}
});
async function seed({keyed,sealed=true}={}){
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async ctx=>{
    const admin=ctx.firestore();
    await setDoc(doc(admin,'users',uid),{name:'SYNTHETIC ADMIN',active:true,role:'admin'});
    await setDoc(doc(admin,'flottaSharedState','current'),{
      ...sourceFleet(),sealed
    });
    await setDoc(doc(admin,'flottaMigrationApproval','current'),approval);
    // Legitimate old mirrored indexes are present. Their data cannot be
    // authoritative, but should not prevent a proper canonical booking.
    await setDoc(doc(admin,'drivers','DA0001'),{
      name:'Synthetic driver',daCode:'DA0001',vendor:'SYNTHETIC',
      active:true,capacity:50
    });
    await setDoc(doc(admin,'vehicles','ABC123'),{
      plate:'ABC123',model:'Ford Transit',status:'Elérhető'
    });
    await setDoc(doc(admin,'driverCapacities','DA0001'),{capacity:50});
    if(keyed){
      await setDoc(doc(admin,'flottaDrivers','DA0001'),driverMaster);
      await setDoc(doc(admin,'flottaVehicles','ABC123'),vehicleMaster);
      await setDoc(doc(admin,'flottaDriverClaims','DA0001'),{sourceIndex:0,revision:1});
      await setDoc(doc(admin,'flottaVehicleClaims','ABC123'),{sourceIndex:0,revision:1});
    }
  });
}
try{
  // This is the HAPPY PATH for a safely migrated, rich canonical source:
  // booking must be allowed and the keyed source must remain byte-for-byte
  // unchanged. A blind tx.set(...{status,capacity}) loses fields/history.
  await seed({keyed:true});
  try{
    const r=await booking('2099-01-17');
    assert.equal(r.committed,true);
    console.log('PASS ALLOW [E+SDK] legitimate booking with trusted migrated keyed source');
    const afterDriver=(await getDoc(keyDriver())).data();
    const afterVehicle=(await getDoc(keyVehicle())).data();
    if(!isDeepStrictEqual(afterDriver,driverMaster)){
      errors.push('P0 DATA LOSS: legitimate booking rewrote trusted keyed DRIVER, dropping original rich fields/history');
      console.error(errors.at(-1),JSON.stringify(afterDriver));
    } else console.log('PASS [E+SDK] complete original keyed driver survived booking');
    if(!isDeepStrictEqual(afterVehicle,vehicleMaster)){
      errors.push('P0 DATA LOSS: legitimate booking rewrote trusted keyed VEHICLE, dropping original rich fields/history');
      console.error(errors.at(-1),JSON.stringify(afterVehicle));
    } else console.log('PASS [E+SDK] complete original keyed vehicle survived booking');
  }catch(e){
    errors.push('P1 FUNCTIONAL BLOCK: legally seeded canonical booking denied: '+(e.code||e.message));
    console.error(errors.at(-1));
  }
  // Keyed masters alone cannot authorize a booking while trusted migration
  // remains unsealed, even if both source documents exist.
  await seed({keyed:true,sealed:false});
  try{
    await booking('2099-01-19');
    errors.push('P0 CUTOVER BYPASS: unsealed source with keyed masters created a booking');
    console.error(errors.at(-1));
  }catch(e){
    if(/BOOKING_BLOCKED: fleet_migration_not_sealed/.test(String(e.message||e)))
      console.log('PASS DENY [E+SDK] approved but unsealed rich Fleet cannot book');
    else {
      errors.push('Unexpected unsealed booking failure: '+(e.code||e.message));
      console.error(errors.at(-1));
    }
  }
  assert.equal((await getDoc(doc(db,'bookings','2099-01-19__ABC123'))).exists(),false,
    'Rejected unsealed booking MUST NOT create a booking document');

  // A missing canonical keyed source is a migration/cutover failure. It must
  // FAIL CLOSED, with no booking or synthetic "authority" created on demand.
  await seed({keyed:false});
  try{
    const r=await booking('2099-01-18');
    if(r.committed){
      errors.push('P0 AUTHORITY FORGERY: booking itself CREATED missing canonical keyed masters and committed');
      console.error(errors.at(-1));
    }else{
      errors.push('P1 FUNCTIONAL: unexpected falsy booking result instead of rejection');
      console.error(errors.at(-1));
    }
  }catch(e){
    if(String(e.message||e).startsWith('BOOKING_BLOCKED')||e.code==='permission-denied'){
      console.log('PASS DENY [E+SDK] absent trusted keyed Fleet masters block booking');
    }else{
      errors.push('UNEXPECTED ERROR during missing-source denial: '+(e.code||e.message));
      console.error(errors.at(-1));
    }
  }
  const b=(await getDoc(doc(db,'bookings','2099-01-18__ABC123'))).exists();
  const kd=(await getDoc(keyDriver())).exists();
  const kv=(await getDoc(keyVehicle())).exists();
  if(b || kd || kv){
    errors.push('P0 CUTOVER FAILURE: missing-keyed-source scenario left booking/keyed documents behind '+
      JSON.stringify({booking:b,driver:kd,vehicle:kv}));
    console.error(errors.at(-1));
  } else console.log('PASS [E+SDK] missing-keyed-source attempt did not write anything');
  assert.equal(errors.length,0,'RELEASE NO-GO: '+errors.join(' || '));
  console.log('PASS V1 KEYED AUTHORITY: no source overwrites and no on-booking bootstrap');
} finally {
  await env.cleanup();
}
