/**
 * Independent P0 acceptance: REAL integrated Firestore Rules, authenticated
 * direct SDK (bypasses original Flotta and Depot UI).
 * A passing Firebase connection is NOT enough: server must DENY forged
 * canonical identity births and destructive blind replacements after seal.
 * ALL DATA/UIDS ARE SYNTHETIC; local emulator only, NO production writes.
 * Expected RED on QA #153 until Grok strengthens the actual Rules.
 */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import {doc,getDoc,setDoc,updateDoc,Timestamp} from 'firebase/firestore';

const uid='synthetic-imile-v1-admin-0000001';
const email='imilemanagement@imile-management-staging.firebaseapp.com';
const sourceSha='d'.repeat(64);
const raw=await readFile(new URL('../../../depokapacitas/firestore-v1-restricted.rules',import.meta.url),'utf8');
assert.ok(raw.includes('REPLACE_WITH_REAL_SHARED_UID'),'Use synthetic UID placeholder, NEVER real UID');
const env=await initializeTestEnvironment({
  projectId:'demo-imile-restricted-v1',
  firestore:{host:'127.0.0.1',port:8787,
    rules:raw.replaceAll('REPLACE_WITH_REAL_SHARED_UID',uid)}
});
const client=env.authenticatedContext(uid,{email}).firestore();
const reference=p=>doc(client,p);
const originalDriver={
  id:'fleet-driver-1',daCode:'DA0001',status:'aktiv',kapacitas:80,
  name:'Rich synthetic driver',agency:'SYNTHETIC',
  history:[{event:'hire',date:'2026-01-01'}]
};
const originalCar={
  id:'fleet-vehicle-1',rendszam:'ABC-123',normalizedPlate:'ABC123',
  status:'aktiv',km:1234,gyartmany:'Ford',modell:'Transit',
  history:[{event:'service',date:'2026-01-02'}]
};
const richDriver={...originalDriver,revision:9,extra:{protectedNote:'keep'}};
const richCar={...originalCar,revision:11,extra:{vin:'SYNTHETIC-VIN'}};
const failures=[];
async function reset(){
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async ctx=>{
    const db=ctx.firestore();
    await setDoc(doc(db,'users',uid),{active:true,role:'admin',name:'SYNTHETIC'});
    await setDoc(doc(db,'flottaMigrationApproval','current'),{
      status:'approved',approvedUid:uid,sourceSha256:sourceSha,
      approvedAt:Timestamp.fromDate(new Date('2026-01-01T00:00:00Z'))
    });
    await setDoc(doc(db,'flottaSharedState','current'),{
      revision:2,sealed:true,migrationSourceSha256:sourceSha,
      drivers:[originalDriver],vehicles:[originalCar],
      contacts:[{id:'contact-1',name:'Preserve'}],
      fuelCards:[{id:'fuel-1',usageHistory:[1,2,3]}]
    });
    await setDoc(doc(db,'flottaDrivers','DA0001'),richDriver);
    await setDoc(doc(db,'flottaVehicles','ABC123'),richCar);
  });
}
async function mustDeny(label,write){
  try{
    await write();
    failures.push('P0 DIRECT SDK ALLOWED: '+label);
    console.error(failures.at(-1));
  }catch(e){
    if(e?.code!=='permission-denied')throw e;
    console.log('PASS DENY [REAL RULES]: '+label);
  }
}
try{
  // Positive control: a real editor must still be able to adjust an existing
  // canonically imported record, while rich metadata remains unchanged.
  await reset();
  await updateDoc(reference('flottaDrivers/DA0001'),{kapacitas:70,revision:10});
  const changed=(await getDoc(reference('flottaDrivers/DA0001'))).data();
  assert.equal(changed.kapacitas,70);
  assert.deepEqual(changed.history,richDriver.history);
  assert.deepEqual(changed.extra,richDriver.extra);
  console.log('PASS ALLOW [REAL RULES]: legitimate rich driver edit');

  // A post-seal editor must not manufacture a new unimported DA or plate by
  // bypassing the browser identity checks; both identities are absent from
  // the trusted archived source and migration manifest.
  await reset();
  await mustDeny('unapproved arbitrary keyed DRIVER create DA9999',()=>setDoc(
    reference('flottaDrivers/DA9999'),
    {daCode:'DA9999',status:'aktiv',kapacitas:999}));
  await reset();
  await mustDeny('unapproved arbitrary keyed VEHICLE create XYZ999',()=>setDoc(
    reference('flottaVehicles/XYZ999'),
    {rendszam:'XYZ-999',status:'aktiv'}));

  // Existing fully imported keyed records MUST NOT be replaceable with
  // minimal 2/3-field maps: a bare setDoc() deletes source history, revision,
  // VIN/lease/contacts/unknown fields. Browser-side merge is not protection.
  await reset();
  await mustDeny('blind keyed DRIVER replace erases rich history',()=>setDoc(
    reference('flottaDrivers/DA0001'),
    {daCode:'DA0001',status:'aktiv',kapacitas:80}));
  await reset();
  await mustDeny('blind keyed VEHICLE replace erases rich history',()=>setDoc(
    reference('flottaVehicles/ABC123'),
    {rendszam:'ABC-123',status:'aktiv'}));

  assert.deepEqual(failures,[],'P0 RELEASE NO-GO: '+failures.join(' | '));
  console.log('PASS: all unauthorized keyed births and destructive overwrites denied by real Rules');
}finally{
  await env.cleanup();
}
