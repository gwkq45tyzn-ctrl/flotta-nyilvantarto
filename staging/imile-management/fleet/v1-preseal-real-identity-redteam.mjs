/**
 * P0 RED TEAM – authenticated direct SDK checks on the ACTUAL
 * depokapacitas/firestore-v1-restricted.rules in Grok 4eb4805.
 * A required identity map is not a trusted identity invariant.
 *
 * EXPECTED RED while Rules accept count-consistent or falsified
 * duplicate identities. This test MUST NOT be weakened to green.
 * Local synthetic Firestore emulator only; no cloud writes.
 */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import {doc,getDoc,setDoc,updateDoc,Timestamp} from 'firebase/firestore';

const projectId='demo-imile-restricted-v1';
const uid='synthetic-imile-v1-admin-0000001';
const email='imilemanagement@imile-management-staging.firebaseapp.com';
const digest='c'.repeat(64);
const raw=await readFile(
  new URL('../../../depokapacitas/firestore-v1-restricted.rules',import.meta.url),'utf8');
assert.match(raw,/REPLACE_WITH_REAL_SHARED_UID/);
const rules=raw.replaceAll('REPLACE_WITH_REAL_SHARED_UID',uid);
const env=await initializeTestEnvironment({projectId,
  firestore:{host:'127.0.0.1',port:8787,rules}});
const db=env.authenticatedContext(uid,{email}).firestore();
const fleetRef=doc(db,'flottaSharedState','current');
const seedDoc=()=>({
  revision:1,migrationSourceSha256:digest,
  vehicles:[{id:'synthetic-car1',rendszam:'TEST0001',
    normalizedPlate:'TEST0001',status:'aktiv',history:[{note:'original vehicle'}]}],
  drivers:[{id:'synthetic-driver1',daCode:'DA-0001',
    status:'aktiv',kapacitas:50,history:[{note:'original driver'}]}],
  fuelCards:[{id:'synthetic-fuel',history:[]}],
  contacts:[{id:'synthetic-contact'}],
  identity:{plateCnt:{TEST0001:1},daCnt:{'DA-0001':1}}
});
async function seed(){
  await env.withSecurityRulesDisabled(async ctx=>{
    const admin=ctx.firestore();
    await setDoc(doc(admin,'users',uid),{name:'SYNTHETIC ADMIN',role:'admin',active:true});
    await setDoc(doc(admin,'flottaMigrationApproval','current'),{
      status:'approved',approvedUid:uid,sourceSha256:digest,
      approvedAt:Timestamp.fromDate(new Date('2026-01-01T00:00:00Z'))
    });
    await setDoc(doc(admin,'flottaSharedState','current'),seedDoc());
  });
}
async function expectAllow(label,action){
  await action();
  console.log('PASS [E+SDK] valid client operation allowed: '+label);
}
const vulnerabilities=[];
async function mustDeny(label,action){
  try {
    await action();
    const message='P0 VULNERABILITY [E+SDK] AUTHORISED BY ACTUAL RULES: '+label;
    vulnerabilities.push(message);
    console.error(message);
  }catch(error){
    if(error.code!=='permission-denied')throw error;
    console.log('PASS DENY [E+SDK]: '+label);
  }
}
try{
  await seed();
  // The current full restricted Rules do not require count maps; mapping
  // alone was never a uniqueness proof. Fail only for ACTUAL duplicates.
  // Legitimate preseal nonidentity metadata update remains usable. The
  // imported original driver/vehicle arrays are *intentionally read-only*:
  // there is no safe generic global uniqueness proof for variable-length
  // Firestore arrays. Legitimate rich driver edits move to keyed docs after seal.
  await expectAllow('preseal revision metadata edit with no source-array drift',async()=>{
    await updateDoc(fleetRef,{revision:2,updatedBy:uid});
    const confirmed=(await getDoc(fleetRef)).data();
    assert.equal(confirmed.revision,2);
    assert.deepEqual(confirmed.drivers,seedDoc().drivers);
    assert.deepEqual(confirmed.vehicles,seedDoc().vehicles);
  });

  await seed();
  const duplicateDriver=seedDoc();
  duplicateDriver.drivers.push({
    id:'synthetic-driver2',daCode:'da-0001',status:'aktiv',
    kapacitas:500,history:[{note:'forged extra driver'}]
  });
  duplicateDriver.identity.daCnt={'DA-0001':2};
  await mustDeny('authenticated SDK appends duplicate normalized DA and supplied count 2',
    ()=>updateDoc(fleetRef,{revision:2,drivers:duplicateDriver.drivers,
      identity:duplicateDriver.identity}));
  await seed();
  const liedDriver=seedDoc();
  liedDriver.drivers.push({
    id:'synthetic-driver2',daCode:'DA-0001',status:'aktiv',
    kapacitas:500,history:[{note:'forged extra driver'}]
  });
  liedDriver.identity.daCnt={'DA-0001':1};
  await mustDeny('authenticated SDK appends duplicate DA and lies count remains 1',
    ()=>updateDoc(fleetRef,{revision:2,drivers:liedDriver.drivers,
      identity:liedDriver.identity}));

  await seed();
  const duplicatePlate=seedDoc();
  duplicatePlate.vehicles.push({
    id:'synthetic-car2',rendszam:'TEST-0001',
    normalizedPlate:'TEST0001',status:'aktiv',
    history:[{note:'forged extra vehicle'}]
  });
  duplicatePlate.identity.plateCnt={TEST0001:2};
  await mustDeny('authenticated SDK appends duplicate normalized plate with supplied count 2',
    ()=>updateDoc(fleetRef,{revision:2,vehicles:duplicatePlate.vehicles,
      identity:duplicatePlate.identity}));
  await seed();
  const liePlate=seedDoc();
  liePlate.vehicles.push({
    id:'synthetic-car2',rendszam:'test-0001',
    normalizedPlate:'TEST0001',status:'aktiv',
    history:[{note:'forged extra vehicle'}]
  });
  liePlate.identity.plateCnt={TEST0001:1};
  await mustDeny('authenticated SDK appends duplicate normalized plate and lies count 1',
    ()=>updateDoc(fleetRef,{revision:2,vehicles:liePlate.vehicles,
      identity:liePlate.identity}));


  // This former "legal" preseal rich edit is intentionally DENIED now;
  // it would otherwise allow normalized business identity duplicates.
  await seed();
  const bridge=seedDoc();
  bridge.drivers[0].kapacitas=70;
  await mustDeny('preseal original bridge-shaped rich array overwrite',
    ()=>setDoc(fleetRef,{
      vehicles:bridge.vehicles,drivers:bridge.drivers,
      fuelCards:bridge.fuelCards,contacts:bridge.contacts,
      revision:2,migrationSourceSha256:digest,
      updatedAt:Timestamp.fromDate(new Date('2026-11-10T00:00:00Z')),
      updatedBy:uid
    }));
  // Positive control for ACTUAL intended workflow: after a trusted
  // privileged source seal, changing a rich keyed driver retains history.
  await env.withSecurityRulesDisabled(async ctx=>{
    const privileged=ctx.firestore();
    await setDoc(doc(privileged,'flottaSharedState','current'),{
      ...seedDoc(),sealed:true
    });
    await setDoc(doc(privileged,'flottaDrivers','DA-0001'),{
      id:'synthetic-driver1',daCode:'DA-0001',
      status:'aktiv',kapacitas:50,
      history:[{note:'original driver'}],revision:1,
      futureField:{retain:true}
    });
  });
  await expectAllow('postseal actual keyed rich driver edit still works',async()=>{
    await updateDoc(doc(db,'flottaDrivers','DA-0001'),{
      kapacitas:70,revision:2
    });
    const confirmed=(await getDoc(doc(db,'flottaDrivers','DA-0001'))).data();
    assert.equal(confirmed.kapacitas,70);
    assert.deepEqual(confirmed.history,[{note:'original driver'}]);
    assert.deepEqual(confirmed.futureField,{retain:true});
  });
  if(vulnerabilities.length){
    throw Error('RELEASE NO-GO: '+vulnerabilities.length+
      ' authenticated direct-SDK duplicate Fleet writes ALLOWED. '+
      vulnerabilities.join('; '));
  }
  console.log('P0 ACCEPTANCE PASS: duplicate DA/plate updates denied by ACTUAL Rules.');
} finally {
  await env.cleanup();
}
