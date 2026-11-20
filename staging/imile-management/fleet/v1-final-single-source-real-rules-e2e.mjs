/**
 * Independent synthetic REAL Firestore SDK and Rules Emulator QA
 * Grok #114 exact HEAD d7b6be73baf89f0a33d0bb62cefa751849f5852b.
 * PASS marked BUG proves a NO-GO bug, never release success.
 * Absolutely no live Auth, database, credentials or deploy.
 */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import {doc,getDoc,setDoc,updateDoc,runTransaction,Timestamp} from 'firebase/firestore';
import {commitCanonicalDepotBooking} from '../../../depokapacitas/canonical-booking-transaction.mjs';
import {assessCanonicalMasterDisplay} from '../../../depokapacitas/canonical-source-health.mjs';

const uid='synthetic-imile-v1-admin-0000001', email='imilemanagement@imile-management-staging.firebaseapp.com';
const sha='f'.repeat(64), day='2099-06-19';
const rules=await readFile(new URL('../../../depokapacitas/firestore-v1-restricted.rules',import.meta.url),'utf8');
assert.ok(rules.includes('REPLACE_WITH_REAL_SHARED_UID'));
const env=await initializeTestEnvironment({
  projectId:'demo-imile-restricted-v1',
  firestore:{host:'127.0.0.1',port:8787,rules:rules.replaceAll('REPLACE_WITH_REAL_SHARED_UID',uid)}
});
const db=env.authenticatedContext(uid,{email}).firestore();
const fref=doc(db,'flottaSharedState','current');
const dref=doc(db,'drivers','DA0001');
const vref=doc(db,'vehicles','ABC123');
const capref=doc(db,'driverCapacities','DA0001');
const bookref=doc(db,'bookings',day+'__ABC123');
const claimref=doc(db,'driverClaims',day+'__DA0001');

function original({plate='ABC123',driverStatus='aktiv',vehicleStatus='aktiv',duplicates=false}={}){
  const v={id:'original-car-1',rendszam:plate,gyartmany:'Ford',
    modell:'Transit',status:vehicleStatus,history:[{what:'synthetic car history'}]};
  const d={id:'original-driver-1',daCode:'DA0001',name:'Synthetic Driver',
    agency:'SYNTHETIC',kapacitas:50,status:driverStatus,
    history:[{what:'synthetic driver history'}]};
  return {
    revision:1,migrationSourceSha256:sha,
    drivers:duplicates?[d,{...d,id:'original-driver-2',status:'inaktiv'}]:[d],
    vehicles:duplicates?[v,{...v,id:'original-car-2',status:'szerviz'}]:[v],
    contacts:[{id:'synthetic-contact',name:'SYNTHETIC'}],
    fuelCards:[{id:'synthetic-fuel',history:[]}],
  };
}
async function seed({fleet=original(),mirrors=false,capacity=true}={}){
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async ctx=>{
    const root=ctx.firestore();
    await setDoc(doc(root,'users',uid),{name:'SYNTHETIC',active:true,role:'admin'});
    await setDoc(doc(root,'flottaMigrationApproval','current'),{
      status:'approved',approvedUid:uid,sourceSha256:sha,
      approvedAt:Timestamp.fromDate(new Date('2026-01-01T00:00:00Z'))
    });
    await setDoc(doc(root,'flottaSharedState','current'),fleet);
    if(capacity)await setDoc(doc(root,'driverCapacities','DA0001'),{capacity:50});
    if(mirrors){
      await setDoc(doc(root,'drivers','DA0001'),{
        daCode:'DA0001',name:'Synthetic Driver',vendor:'SYNTHETIC',
        capacity:50,active:true
      });
      await setDoc(doc(root,'vehicles','ABC123'),{
        plate:'ABC123',model:'Ford Transit',status:'Elérhető'
      });
    }
  });
}
async function app(vehicleId='ABC123'){
  return commitCanonicalDepotBooking({
    db,sdk:{doc,runTransaction},uid,getCurrentUid:()=>uid,offline:false,
    booking:{date:day,driverId:'DA0001',vehicleId,district:'01',status:'planned'}
  });
}
async function rawBooking(){
  return runTransaction(db,async tx=>{
    const [b,c]=await Promise.all([tx.get(bookref),tx.get(claimref)]);
    assert.equal(b.exists(),false);
    assert.equal(c.exists(),false);
    tx.set(bookref,{date:day,driverId:'DA0001',vehicleId:'ABC123',
      district:'01',status:'planned',capacity:50,driverIndex:0,vehicleIndex:0});
    tx.set(claimref,{date:day,driverId:'DA0001',bookingId:day+'__ABC123'});
    return true;
  });
}
async function deny(label,fn,pattern){
  await assert.rejects(fn,e=>{
    assert.match(String(e?.message||e),pattern??/PERMISSION_DENIED|permission-denied/i,label);
    return true;
  });
  console.log('PASS [E] expected DENY: '+label);
}
async function absent(){
  assert.equal((await getDoc(bookref)).exists(),false);
  assert.equal((await getDoc(claimref)).exists(),false);
}
try{
  // Positive, canonical source ONLY: no old /drivers or /vehicles needed.
  await seed();
  const t=Date.now();
  const sourceMeta=Object.fromEntries(
    ['drivers','vehicles','flottaSharedState','flottaMigrationApproval']
      .map(x=>[x,{loaded:true,error:false,fromCache:false,pending:false,serverAt:t}])
  );
  const ui=assessCanonicalMasterDisplay({
    fleet:(await getDoc(fref)).data(),
    approval:{status:'approved',approvedUid:uid,sourceSha256:sha},
    uid,driverMirrors:[],vehicleMirrors:[],sourceMeta,online:true,now:t
  });
  assert.equal(ui.trusted,true);
  assert.equal(ui.vehicles.length,1);
  assert.equal((await app()).committed,true);
  assert.equal((await getDoc(bookref)).exists(),true);
  console.log('PASS [E] actual canonical Fleet ONLY display and booking/claim positive ALLOW');

  // Normal original plate with hyphen will fail in the ACTUAL app adapter,
  // because the revised findIndex uses raw plate == normalized "ABC123".
  await seed({fleet:original({plate:'ABC-123'})});
  await deny('BUG valid original ABC-123 rejects normal normalized ABC123 app booking',
    ()=>app('ABC123'),/BOOKING_BLOCKED: master_index_not_found/);
  await absent();
  await deny('BUG raw ABC-123 vehicle ID rejected by actual booking adapter',
    ()=>app('ABC-123'),/BOOKING_BLOCKED: invalid_booking_fields/);
  console.log('PASS [E] P0 BUG valid hyphenated original car CANNOT book either ID path');

  // Empty mirrored masters are okay for booking ONLY if driverCapacities
  // already exists. A normal operator cannot CREATE/UPDATE capacity because
  // the Rule still requires /drivers even though Fleet does not write one.
  await seed();
  await deny('BUG ordinary capacity update without legacy /drivers mirror',
    ()=>updateDoc(capref,{capacity:70}));
  console.log('PASS [E] P0 BUG canonical-only Depot capacity edits blocked by old mirror Rules');

  await seed({capacity:false});
  await deny('BUG canonical-only booking without preseeded /driverCapacities',
    app,/BOOKING_BLOCKED: invalid_capacity/);
  await absent();
  console.log('PASS [E] P0 BUG booking still requires separately preseeded driver capacity');

  await seed({fleet:original({vehicleStatus:'szerviz'})});
  await deny('canonical service car direct SDK',rawBooking);
  await absent();
  await seed({fleet:original({driverStatus:'inaktiv'})});
  await deny('canonical inactive driver direct SDK',rawBooking);
  await absent();

  // Index-only canonical array check does not prove global uniqueness.
  await seed({fleet:original({duplicates:true})});
  assert.equal(await rawBooking(),true);
  assert.equal((await getDoc(bookref)).exists(),true);
  console.log('PASS [E] P0 BUG raw SDK still books duplicate canonical IDs');

  // Grok claims mirrors are locked after import. Driver path is closed, but
  // vehicle path STILL permits update in same transaction as revision bump.
  await seed({mirrors:true});
  await runTransaction(db,async tx=>{
    const before=await tx.get(fref);
    tx.update(fref,{revision:before.data().revision+1});
    tx.set(vref,{plate:'ABC123',model:'ATTACKER MIRROR',status:'Szerviz'});
  });
  assert.equal((await getDoc(vref)).data().status,'Szerviz');
  assert.equal((await getDoc(fref)).data().vehicles[0].status,'aktiv');
  console.log('PASS [E] P0 BUG /vehicles mirror writable post-import with revision bump');

  console.log('PASS REAL local independent Grok #114 SDK/Rules witnesses; overall NO-GO');
}finally{await env.cleanup();}
