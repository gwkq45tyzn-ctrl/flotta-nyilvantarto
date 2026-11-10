/**
 * P0 red-team tests on Grok's ACTUAL full restricted Rules at 52208b8.
 * The 'sealed' flag must be monotonic and IMMUTABLE to all browser clients;
 * a read-only-array check alone can be evaded by unsealing first.
 * Test also verifies legacy pre-cutover bridge compatibility when 'sealed'
 * has never existed on the original rich Fleet.
 * Local Firebase emulator with synthetic identities/data ONLY.
 */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import {doc,getDoc,setDoc,updateDoc,Timestamp} from 'firebase/firestore';

const uid='synthetic-imile-v1-admin-0000001';
const sha='a'.repeat(64);
const email='imilemanagement@imile-management-staging.firebaseapp.com';
const source=await readFile(new URL('../../../depokapacitas/firestore-v1-restricted.rules',import.meta.url),'utf8');
assert.match(source,/REPLACE_WITH_REAL_SHARED_UID/);
const env=await initializeTestEnvironment({
  projectId:'demo-imile-restricted-v1',
  firestore:{host:'127.0.0.1',port:8787,
    rules:source.replaceAll('REPLACE_WITH_REAL_SHARED_UID',uid)}
});
const db=env.authenticatedContext(uid,{email}).firestore();
const fleetRef=doc(db,'flottaSharedState','current');
const base=()=>({
  revision:1,migrationSourceSha256:sha,
  drivers:[{id:'driver-a',daCode:'DA-0001',status:'aktiv',
    kapacitas:50,history:[{note:'preserve driver history'}]}],
  vehicles:[{id:'car-a',rendszam:'TEST-0001',status:'aktiv',
    normalizedPlate:'TEST0001',history:[{note:'preserve vehicle history'}]}],
  fuelCards:[{id:'fc1',history:[]}],
  contacts:[{id:'ct1',name:'Synthetic'}]
});
async function seed(sealMode='true'){
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async ctx=>{
    const admin=ctx.firestore();
    await setDoc(doc(admin,'users',uid),
      {name:'SYNTHETIC ADMIN',active:true,role:'admin'});
    await setDoc(doc(admin,'flottaMigrationApproval','current'),{
      status:'approved',approvedUid:uid,sourceSha256:sha,
      approvedAt:Timestamp.fromDate(new Date('2026-01-01T00:00:00Z'))
    });
    const docData=base();
    if(sealMode==='true')docData.sealed=true;
    if(sealMode==='false')docData.sealed=false;
    // sealMode='absent' represents the ORIGINAL source, before this feature.
    await setDoc(doc(admin,'flottaSharedState','current'),docData);
    await setDoc(doc(admin,'flottaDrivers','DA-0001'),{
      daCode:'DA-0001',status:'aktiv',kapacitas:50,
      name:'Synthetic Migrated Driver',history:[{note:'preserve'}]
    });
    await setDoc(doc(admin,'flottaVehicles','TEST0001'),{
      rendszam:'TEST-0001',status:'aktiv',modell:'Synthetic',
      history:[{note:'preserve'}]
    });
  });
}
const violations=[];
async function deny(label,op){
  try {
    await op();
    violations.push(label);
    console.error('P0 RULES ALLOWED UNAUTHORIZED WRITE [E+SDK]: '+label);
  }catch(e){
    if(e.code!=='permission-denied')throw e;
    console.log('PASS DENY [E+SDK] '+label);
  }
}
async function allow(label,op){
  try{
    await op();
    console.log('PASS ALLOW [E+SDK] '+label);
  }catch(e){
    if(e.code!=='permission-denied')throw e;
    const msg='P1 NORMAL WORKFLOW DENIED [E+SDK]: '+label;
    violations.push(msg);console.error(msg);
  }
}
const cloned=o=>structuredClone(o);
try{
  await seed('true');
  await deny('direct edit of legacy drivers in sealed snapshot',()=>{
    const d=base().drivers;d[0].kapacitas=900;
    return updateDoc(fleetRef,{revision:2,drivers:d});
  });
  await seed('true');
  await deny('a browser UNSEALS trusted sealed snapshot without changing arrays',
    ()=>updateDoc(fleetRef,{revision:2,sealed:false}));
  // Even if unsealing was allowed, test the FOLLOW-ON attack in the SAME
  // signed-in browser to reproduce complete, real exploit chain.
  const afterUnseal=(await getDoc(fleetRef)).data();
  if(afterUnseal.sealed===false){
    const d=base().drivers;
    d.push({...cloned(d[0]),id:'forged-b',daCode:'da-0001',kapacitas:500});
    await deny('authenticated duplicate DA inserted AFTER user-controlled unseal',
      ()=>updateDoc(fleetRef,{revision:3,drivers:d}));
  }
  await seed('false');
  const forged=base().drivers;
  forged.push({...cloned(forged[0]),id:'forged-b',kapacitas:500});
  await deny('client seals a deliberately DUPLICATED legacy Fleet in same write',
    ()=>updateDoc(fleetRef,{revision:2,drivers:forged,sealed:true}));
  await seed('true');
  await deny('client removes sealed flag via full original bridge-shaped set',
    ()=>setDoc(fleetRef,{...base(),revision:2,
      updatedAt:Timestamp.fromDate(new Date('2026-11-10T00:00:00Z')),
      updatedBy:uid}));
  // The original Fleet source was seeded without 'sealed'; the current
  // unadapted bridge still produces a full replacement without it.
  // Before any approved structural cutover, this legal path MUST continue.
  await seed('absent');
  await allow('pre-cutover original Fleet full bridge save without sealed field',()=>{
    const d=base();d.revision=2;d.drivers[0].kapacitas=70;
    return setDoc(fleetRef,{...d,
      updatedAt:Timestamp.fromDate(new Date('2026-11-10T00:00:00Z')),
      updatedBy:uid});
  });

  assert.deepEqual(violations,[],
    'NO-GO: source-seal integrity and/or pre-cutover original Fleet workflow violated');
  console.log('SEALED FLAG HARD-STOP PASS on real integrated restricted Rules');
}finally{
  await env.cleanup();
}
