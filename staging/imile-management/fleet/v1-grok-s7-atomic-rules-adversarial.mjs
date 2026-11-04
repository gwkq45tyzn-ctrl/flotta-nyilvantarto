/**
 * S7 Grok atomic projection adversarial PROOF (real LOCAL Firestore emulator).
 *
 * These are deliberately vulnerable/blocked-behaviour witnesses, NOT a
 * shippable Fleet fix.  The *actual* browser bridge and restricted Rules must
 * be repaired and reviewed after this independently reproducible evidence.
 * No real UID, cloud project, passwords, deployment or user data.
 */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import {doc,setDoc,getDoc,updateDoc,runTransaction,Timestamp} from 'firebase/firestore';

const uid='synthetic-imile-v1-admin-0000001';
const email='imilemanagement@imile-management-staging.firebaseapp.com';
const sourceSha256='f'.repeat(64);
const raw=await readFile(new URL('../../../depokapacitas/firestore-v1-restricted.rules',import.meta.url),'utf8');
assert.ok(raw.includes('REPLACE_WITH_REAL_SHARED_UID'));
const env=await initializeTestEnvironment({
  projectId:'demo-imile-restricted-v1',
  firestore:{host:'127.0.0.1',port:8787,
    rules:raw.replaceAll('REPLACE_WITH_REAL_SHARED_UID',uid)}
});
const db=env.authenticatedContext(uid,{email}).firestore();
const refFleet=doc(db,'flottaSharedState','current');
const refDriver=doc(db,'drivers','DA0001');
const refVehicle=doc(db,'vehicles','ABC123');
const rawFleet={
  revision:1,
  migrationSourceSha256:sourceSha256,
  vehicles:[{id:'vehicle-original',rendszam:'ABC-123',
    gyartmany:'Ford',modell:'Transit',status:'aktiv',
    history:[{detail:'SYNTHETIC ORIGINAL SERVICE'}]}],
  drivers:[{id:'driver-original',daCode:'DA0001',name:'SYNTHETIC ORIGINAL',
    agency:'SYNTHETIC',status:'aktiv',kapacitas:80,
    history:[{detail:'SYNTHETIC DRIVER HISTORY'}]}],
  fuelCards:[{id:'synthetic-card',history:[{amount:25}]}],
  contacts:[{id:'synthetic-contact',phone:'000-000'}]
};
const driver=name=>({name,daCode:'DA0001',vendor:'SYNTHETIC',
  capacity:80,active:true});
const vehicle={plate:'ABC123',model:'Ford Transit',status:'Elérhető'};
async function state(){
  return {
    fleet:(await getDoc(refFleet)).data(),
    driver:(await getDoc(refDriver)).data(),
    vehicle:(await getDoc(refVehicle)).data()
  };
}
async function deny(label,fn){
  try {await fn();throw new Error('UNEXPECTED PERMISSION: '+label);}
  catch(e){
    if(e.message?.startsWith('UNEXPECTED PERMISSION'))throw e;
    assert.equal(e.code,'permission-denied',label+': '+e.message);
    console.log('PASS [E] REJECT '+label+': '+e.code);
  }
}

try {
  await env.withSecurityRulesDisabled(async ctx=>{
    const admin=ctx.firestore();
    await setDoc(doc(admin,'users',uid),{name:'SYNTHETIC',active:true,role:'admin'});
    await setDoc(doc(admin,'flottaMigrationApproval','current'),{
      status:'approved',approvedUid:uid,sourceSha256,
      approvedAt:Timestamp.fromDate(new Date('2026-01-01T00:00:00Z'))
    });
    await setDoc(doc(admin,'flottaSharedState','current'),rawFleet);
    await setDoc(doc(admin,'drivers','DA0001'),driver('SYNTHETIC ORIGINAL'));
    await setDoc(doc(admin,'vehicles','ABC123'),vehicle);
  });

  // The GROK bridge's tx.set() payload lacks migrationSourceSha256 although
  // the restricted V1 Fleet update Rule REQUIRES it.  Ensure the emulator
  // denies this exact replacement write and rolls back BOTH mirrors.
  await deny('Grok raw tx.set full Fleet payload drops immutable import source SHA',
    ()=>runTransaction(db,async tx=>{
      const before=await tx.get(refFleet);
      const next=before.data().revision+1;
      tx.set(refFleet,{
        vehicles:rawFleet.vehicles,drivers:rawFleet.drivers,
        contacts:rawFleet.contacts,fuelCards:rawFleet.fuelCards,
        revision:next,updatedAt:Timestamp.now(),updatedBy:uid
      });
      tx.set(refDriver,driver('TRIED TO EDIT'));
      tx.set(refVehicle,vehicle);
    }));
  let got=await state();
  assert.equal(got.fleet.revision,1);
  assert.equal(got.fleet.migrationSourceSha256,sourceSha256);
  assert.equal(got.driver.name,'SYNTHETIC ORIGINAL');
  console.log('PASS [E] NO-GO blocker 1: actual bridge transaction shape denied; ALL writes rolled back');

  // A corrected preserving-source transaction can succeed. This is a
  // CAPABILITY test only, NOT an invariant proof for all masters.
  await runTransaction(db,async tx=>{
    const before=await tx.get(refFleet);
    tx.update(refFleet,{
      revision:before.data().revision+1,
      drivers:[{...rawFleet.drivers[0],name:'SYNTHETIC VALID CHANGED'}]
    });
    tx.set(refDriver,driver('SYNTHETIC VALID CHANGED'));
    tx.set(refVehicle,vehicle);
  });
  got=await state();
  assert.equal(got.fleet.revision,2);
  assert.equal(got.driver.name,'SYNTHETIC VALID CHANGED');
  assert.equal(got.fleet.drivers[0].name,'SYNTHETIC VALID CHANGED');
  assert.deepEqual(got.fleet.fuelCards,rawFleet.fuelCards);
  assert.deepEqual(got.fleet.contacts,rawFleet.contacts);
  assert.deepEqual(got.fleet.vehicles[0].history,rawFleet.vehicles[0].history);
  console.log('PASS [E] source-preserving limited transaction with matching mirror is possible');

  // CRITICAL bypass: Rules checks only joint Fleet REVISION update, NOT
  // that the mirror name reflects the original full Fleet driver array.
  // A direct SDK authenticated editor can still forge an unrelated strict
  // Depot master while incrementing Fleet revision in the same transaction.
  await runTransaction(db,async tx=>{
    const before=await tx.get(refFleet);
    tx.update(refFleet,{revision:before.data().revision+1});
    tx.set(refDriver,driver('FORGED MIRROR UNRELATED TO ORIGINAL FLEET'));
  });
  got=await state();
  assert.equal(got.fleet.revision,3);
  assert.equal(got.fleet.drivers[0].name,'SYNTHETIC VALID CHANGED');
  assert.equal(got.driver.name,'FORGED MIRROR UNRELATED TO ORIGINAL FLEET');
  console.log('PASS [E] NO-GO blocker 2: Rules ALLOWED source-revision bump + FORGED MIRROR with no parity');

  // Opposite direction: Rules lets a Fleet master edit happen WITHOUT
  // any mirror changes at all. This permanently drifts the two projections.
  await updateDoc(refFleet,{
    revision:4,
    drivers:[{...rawFleet.drivers[0],name:'SYNTHETIC MASTER ONLY'}]
  });
  got=await state();
  assert.equal(got.fleet.revision,4);
  assert.equal(got.fleet.drivers[0].name,'SYNTHETIC MASTER ONLY');
  assert.equal(got.driver.name,'FORGED MIRROR UNRELATED TO ORIGINAL FLEET');
  console.log('PASS [E] NO-GO blocker 3: solo Fleet master write ALLOWED without canonical mirror transaction');

  // Out-of-band mirror single update is still denied. This protection is
  // useful, but insufficient when the joint transaction can lie.
  await deny('direct mirror-only SDK write remains prohibited',
    ()=>updateDoc(refDriver,{name:'MIRROR ONLY'}));
  console.log('PASS LOCAL S7 adversarial emulator: 3 independently proven NO-GO blockers; no production change');
}finally {await env.cleanup();}
