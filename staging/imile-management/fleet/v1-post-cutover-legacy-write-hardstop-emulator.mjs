/**
 * Release P0: real iMile restricted Rules MUST DENY direct Firestore SDK
 * writes to the legacy driver/vehicle arrays after trusted keyed migration.
 *
 * Independent source: #144 QA commit 3b3f4582b21c41748f7ba82e0a39e1e968e8dcdf.
 * Local emulator, synthetic users/data, no cloud operations, NO production.
 *
 * This is EXPECTED RED until Grok implements an immutable, trustworthy
 * post-cutover seal and makes keyed driver/vehicle records authoritative.
 *
 * The positive control exercises a legal edit of a rich keyed master. This
 * test does not replace original UI E2E, #133/#141, or trusted migration QA.
 */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import {doc,getDoc,setDoc,updateDoc,Timestamp} from 'firebase/firestore';

const uid='synthetic-imile-v1-admin-0000001';
const email='imilemanagement@imile-management-staging.firebaseapp.com';
const sha='c'.repeat(64);
const rulesSource=await readFile(
  new URL('../../../depokapacitas/firestore-v1-restricted.rules',import.meta.url),'utf8');
assert.match(rulesSource,/REPLACE_WITH_REAL_SHARED_UID/);
const env=await initializeTestEnvironment({
  projectId:'demo-imile-restricted-v1',
  firestore:{host:'127.0.0.1',port:8787,
    rules:rulesSource.replaceAll('REPLACE_WITH_REAL_SHARED_UID',uid)}
});
const sdk=env.authenticatedContext(uid,{email}).firestore();
const fleetRef=doc(sdk,'flottaSharedState','current');
const driverRef=doc(sdk,'flottaDrivers','DA-0001');
const vehicleRef=doc(sdk,'flottaVehicles','TEST0001');
const richDriver=()=>({
  daCode:'DA-0001',status:'aktiv',kapacitas:50,
  id:'original-fleet-driver',name:'Full driver master',agency:'SYNTHETIC',
  history:[{type:'assignment',date:'2098-01-01',note:'PRESERVE'}]
});
const richVehicle=()=>({
  rendszam:'TEST-0001',status:'aktiv',
  gyartmany:'Ford',modell:'Transit',id:'original-fleet-vehicle',
  history:[{type:'service',date:'2098-01-01',note:'PRESERVE'}]
});
const richFleet=()=>({
  revision:1,migrationSourceSha256:sha,
  drivers:[richDriver()],vehicles:[{...richVehicle(),normalizedPlate:'TEST0001'}],
  fuelCards:[{id:'fuel-card-1',history:[{note:'keep'}]}],
  contacts:[{id:'contact-1',name:'Synthetic contact'}]
});

async function setup(){
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async context=>{
    const db=context.firestore();
    await setDoc(doc(db,'users',uid),{
      name:'SYNTHETIC ADMIN',role:'admin',active:true
    });
    await setDoc(doc(db,'flottaMigrationApproval','current'),{
      status:'approved',approvedUid:uid,sourceSha256:sha,
      approvedAt:Timestamp.fromDate(new Date('2026-01-01T00:00:00Z'))
    });
    await setDoc(doc(db,'flottaSharedState','current'),richFleet());
    // A complete trusted migration has populated BOTH keyed canonical masters.
    await setDoc(doc(db,'flottaDrivers','DA-0001'),richDriver());
    await setDoc(doc(db,'flottaVehicles','TEST0001'),richVehicle());
  });
}
const bad=[];
async function mustDeny(label,action){
  try{
    await action();
    bad.push(label);
    console.error('P0 LEGACY BYPASS AUTHORIZED [E+SDK]: '+label);
  }catch(error){
    if(error.code!=='permission-denied')
      throw Error(label+' unexpected error: '+error.message,{cause:error});
    console.log('PASS DENY [E+SDK] '+label);
  }
}
async function mustAllow(label,action){
  await action();
  console.log('PASS ALLOW [E+SDK] '+label);
}
try{
  await setup();
  const initial=(await getDoc(fleetRef)).data();
  assert.equal(initial.drivers.length,1);
  assert.equal((await getDoc(driverRef)).data().history[0].note,'PRESERVE');
  assert.equal((await getDoc(vehicleRef)).data().history[0].note,'PRESERVE');

  // Positive: a legal authenticated editor should be able to change a
  // keyed canonical record without replacing its historical body.
  await mustAllow('legal keyed driver capacity change preserves history',
    ()=>updateDoc(driverRef,{kapacitas:70}));
  assert.equal((await getDoc(driverRef)).data().kapacitas,70);
  assert.equal((await getDoc(driverRef)).data().history[0].note,'PRESERVE');

  await mustDeny('legacy driver single-row edit AFTER keyed cutover',
    ()=>updateDoc(fleetRef,{
      revision:2,drivers:[{...richDriver(),kapacitas:500}]
    }));
  await setup();

  const twiceDriver=richFleet().drivers;
  twiceDriver.push({
    ...richDriver(),daCode:'da-0001',id:'forged-driver-2',
    kapacitas:10000,history:[{note:'forged'}]
  });
  await mustDeny('legacy Fleet array: duplicate normalized DA after keyed cutover',
    ()=>updateDoc(fleetRef,{revision:2,drivers:twiceDriver}));
  await setup();

  const twicePlate=richFleet().vehicles;
  twicePlate.push({
    ...richVehicle(),rendszam:'test0001',normalizedPlate:'TEST0001',
    id:'forged-car-2',history:[{note:'forged'}]
  });
  await mustDeny('legacy Fleet array: duplicate normalized PLATE after keyed cutover',
    ()=>updateDoc(fleetRef,{revision:2,vehicles:twicePlate}));
  await setup();

  // The original Fleet bridge does full-document tx.set instead of
  // updateDoc. After cutover the old bridge must be disabled/gated;
  // bypassing via a full replacement is equally serious.
  const legacyBridgePayload={
    ...richFleet(),revision:2,
    drivers:[{...richDriver(),kapacitas:999}],
    updatedBy:uid,
    updatedAt:Timestamp.fromDate(new Date('2026-11-10T00:00:00Z'))
  };
  await mustDeny('old original Fleet bridge-shaped full set after keyed cutover',
    ()=>setDoc(fleetRef,legacyBridgePayload));

  assert.equal(bad.length,0,
    'RELEASE NO-GO: '+bad.length+' legacy Fleet SDK updates bypassed keyed canonical cutover: '+bad.join(' | '));
  console.log('P0 SUCCESS: all old Fleet array and full-document writes blocked after migrated keyed masters exist.');
}finally{
  await env.cleanup();
}
