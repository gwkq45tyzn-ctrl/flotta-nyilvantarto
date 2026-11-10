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
  // Control: current rule genuinely checks identity map presence on UPDATE.
  const missingIdentity=seedDoc();
  await mustDeny('missing identity maps in direct SDK UPDATE',
    ()=>updateDoc(fleetRef,{revision:2,identity:null}));
  // Positive check: keeping same counts on a legitimate single-record edit
  // must work; a fail-closed but unusable Depot is not a valid fix.
  await expectAllow('legitimate rich driver edit preserving identity maps',async()=>{
    const source=seedDoc();
    source.drivers[0].kapacitas=70;
    await updateDoc(fleetRef,{revision:2,drivers:source.drivers,
      identity:source.identity});
    const confirmed=(await getDoc(fleetRef)).data();
    assert.equal(confirmed.drivers[0].kapacitas,70);
    assert.equal(confirmed.identity.daCnt['DA-0001'],1);
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

  if(vulnerabilities.length){
    throw Error('RELEASE NO-GO: '+vulnerabilities.length+
      ' authenticated direct-SDK duplicate Fleet source writes were allowed. '+ 
      'Counter field presence is not an invariant or a hard stop.');
  }
  console.log('P0 ACCEPTANCE PASS: duplicate DA/plate updates denied by ACTUAL Rules.');
} finally {
  await env.cleanup();
}
