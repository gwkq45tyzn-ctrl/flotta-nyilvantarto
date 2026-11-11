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
  // NEW SECURITY CONTRACT: immutable imported identity arrays before AND
  // after seal. A nonidentity metadata update is still allowed, proving that
  // negative probes are not trivially denied for missing approval or auth.
  await expectAllow('legitimate approved preseal metadata-only update',async()=>{
    await updateDoc(fleetRef,{revision:2,updatedBy:uid});
    const confirmed=(await getDoc(fleetRef)).data();
    assert.equal(confirmed.revision,2);
    assert.equal(confirmed.drivers[0].daCode,'DA-0001');
    assert.equal(confirmed.vehicles[0].rendszam,'TEST0001');
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


  // A raw original Fleet bridge-shaped source rewrite before trusted seal
  // MUST now fail closed. Keep this regression test explicit, not discarded.
  await seed();
  const bridge=seedDoc();
  bridge.drivers[0].kapacitas=70;
  const bridgePayload={
    vehicles:bridge.vehicles,drivers:bridge.drivers,
    fuelCards:bridge.fuelCards,contacts:bridge.contacts,
    revision:2,migrationSourceSha256:digest,
    updatedAt:Timestamp.fromDate(new Date('2026-11-10T00:00:00Z')),
    updatedBy:uid
  };
  await mustDeny('preseal original Fleet bridge-shaped edit cannot rewrite imported identity arrays',
    ()=>setDoc(fleetRef,bridgePayload));

  // Positive postseal: separately seeded privileged keyed identities remain
  // safely editable without ever rewriting the frozen old arrays.
  await env.withSecurityRulesDisabled(async ctx=>{
    const admin=ctx.firestore();
    const sealed=seedDoc();
    await setDoc(doc(admin,'flottaSharedState','current'),{
      ...sealed,sealed:true
    });
    await setDoc(doc(admin,'flottaDrivers','DA-0001'),{
      ...sealed.drivers[0],revision:1
    });
    await setDoc(doc(admin,'flottaVehicles','TEST0001'),{
      ...sealed.vehicles[0],revision:1
    });
  });
  await expectAllow('postseal keyed rich driver capacity update remains possible',async()=>{
    await updateDoc(doc(db,'flottaDrivers','DA-0001'),
      {kapacitas:70,revision:2});
    const post=await getDoc(doc(db,'flottaDrivers','DA-0001'));
    assert.equal(post.data().kapacitas,70);
    assert.deepEqual(post.data().history,seedDoc().drivers[0].history);
  });

  if(vulnerabilities.length){
    throw Error('RELEASE NO-GO: '+vulnerabilities.length+
      ' forbidden signed-in preseal array writes were authorized. '+
      'Source arrays must remain immutable until privileged sealed keyed import.');
  }
  console.log('P0 ACCEPTANCE PASS: duplicate DA/plate updates denied by ACTUAL Rules.');
} finally {
  await env.cleanup();
}
