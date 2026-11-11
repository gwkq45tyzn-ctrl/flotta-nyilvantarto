/**
 * #133 / #141 pre-seal adversarial authenticated SDK probes against full restricted Rules.
 * Synthetic local emulator only. Expected DENY on forged creates, history wipes,
 * identity rewrites, and unauthorized seals before trusted migration.
 */
import assert from 'node:assert/strict';
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing';
import {doc,setDoc,updateDoc,getDoc} from 'firebase/firestore';
import {readFile} from 'node:fs/promises';

const uid='synthetic-imile-v1-admin-0000001';
const email='imilemanagement@imile-management-staging.firebaseapp.com';
const projectId='demo-imile-restricted-v1';

async function main(){
  const raw=await readFile(new URL('../../../depokapacitas/firestore-v1-restricted.rules',import.meta.url),'utf8');
  assert.match(raw,/REPLACE_WITH_REAL_SHARED_UID/);
  const env=await initializeTestEnvironment({
    projectId,
    firestore:{host:'127.0.0.1',port:8787,rules:raw.replaceAll('REPLACE_WITH_REAL_SHARED_UID',uid)}
  });
  const client=env.authenticatedContext(uid,{email}).firestore();
  try{
    await env.withSecurityRulesDisabled(async ctx=>{
      const db=ctx.firestore();
      await setDoc(doc(db,'users',uid),{active:true,role:'admin',name:'SYNTHETIC'});
      await setDoc(doc(db,'flottaSharedState','current'),{
        revision:1,sealed:false,drivers:[{daCode:'DA0001'}],vehicles:[{rendszam:'ABC-123'}]
      });
    });

    // #133-style: unauthorized keyed create before seal
    await assertFails(setDoc(doc(client,'flottaDrivers','DA9999'),{daCode:'DA9999',status:'aktiv',kapacitas:1}));
    await assertFails(setDoc(doc(client,'flottaVehicles','XYZ999'),{rendszam:'XYZ-999',status:'aktiv'}));

    // Seed one legitimate keyed for update probes
    await env.withSecurityRulesDisabled(async ctx=>{
      await setDoc(doc(ctx.firestore(),'flottaDrivers','DA0001'),{
        daCode:'DA0001',status:'aktiv',kapacitas:80,history:[{e:'hire'}],revision:1
      });
    });

    // Blind wipe / history truncation
    await assertFails(setDoc(doc(client,'flottaDrivers','DA0001'),{daCode:'DA0001',status:'aktiv',kapacitas:80}));
    await assertFails(updateDoc(doc(client,'flottaDrivers','DA0001'),{history:[],revision:2}));

    // Identity rewrite
    await assertFails(updateDoc(doc(client,'flottaDrivers','DA0001'),{daCode:'DA0002',revision:2}));

    // Unauthorized seal
    await assertFails(updateDoc(doc(client,'flottaSharedState','current'),{sealed:true,revision:2}));

    console.log('PASS: #133/#141 pre-seal adversarial SDK probes denied by restricted Rules');
  }finally{
    await env.cleanup();
  }
}
main().catch(e=>{console.error(e);process.exit(1);});
