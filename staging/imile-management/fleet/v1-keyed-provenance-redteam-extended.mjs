/**
 * Extended #157 red-team verification on the #161 candidate Rules.
 * Adds probes for history truncation with revision bump and raw identity rewrite.
 * Expected: all DENY except legitimate capacity update.
 * Synthetic local emulator only.
 */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import {doc,getDoc,setDoc,updateDoc,Timestamp} from 'firebase/firestore';

const uid='synthetic-imile-v1-admin-0000001';
const email='imilemanagement@imile-management-staging.firebaseapp.com';
const sourceSha='d'.repeat(64);
const raw=await readFile(new URL('../../../depokapacitas/firestore-v1-restricted.rules',import.meta.url),'utf8');
assert.ok(raw.includes('REPLACE_WITH_REAL_SHARED_UID'));
const env=await initializeTestEnvironment({
  projectId:'demo-imile-restricted-v1',
  firestore:{host:'127.0.0.1',port:8787,
    rules:raw.replaceAll('REPLACE_WITH_REAL_SHARED_UID',uid)}
});
const client=env.authenticatedContext(uid,{email}).firestore();
const reference=p=>doc(client,p);

const richDriver={
  id:'fleet-driver-1',daCode:'DA0001',status:'aktiv',kapacitas:80,
  name:'Rich synthetic driver',history:[{event:'hire'}],revision:9,extra:{note:'keep'}
};

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
      drivers:[{daCode:'DA0001'}],vehicles:[{rendszam:'ABC-123'}],
      contacts:[],fuelCards:[]
    });
    await setDoc(doc(db,'flottaDrivers','DA0001'),richDriver);
  });
}

const failures=[];
async function mustDeny(label,write){
  try{
    await write();
    failures.push('ALLOWED: '+label);
  }catch(e){
    if(e?.code!=='permission-denied') throw e;
    console.log('PASS DENY:',label);
  }
}

try{
  await reset();
  // Positive
  await updateDoc(reference('flottaDrivers/DA0001'),{kapacitas:70,revision:10});
  const after=(await getDoc(reference('flottaDrivers/DA0001'))).data();
  assert.equal(after.kapacitas,70);
  assert.deepEqual(after.history,richDriver.history);
  console.log('PASS ALLOW: legitimate capacity update');

  await reset();
  await mustDeny('create new DA9999',()=>setDoc(reference('flottaDrivers/DA9999'),{daCode:'DA9999',status:'aktiv',kapacitas:1}));

  await reset();
  await mustDeny('blind setDoc wipe',()=>setDoc(reference('flottaDrivers/DA0001'),{daCode:'DA0001',status:'aktiv',kapacitas:80}));

  await reset();
  await mustDeny('history truncation with rev bump',()=>updateDoc(reference('flottaDrivers/DA0001'),{
    kapacitas:70,revision:10,history:[]
  }));

  await reset();
  await mustDeny('raw DA rewrite',()=>updateDoc(reference('flottaDrivers/DA0001'),{
    daCode:'DA0002',revision:10
  }));

  assert.deepEqual(failures,[]);
  console.log('PASS: extended #157 probes denied on candidate Rules');
}finally{
  await env.cleanup();
}
