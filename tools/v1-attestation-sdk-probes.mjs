/**
 * Additional independent SDK denial probes for #184.
 * Client cannot edit sourceIndex, forge claims, or drift identity after seal.
 * Local emulator only. Synthetic data.
 */
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing';
import {doc,setDoc,updateDoc} from 'firebase/firestore';
import {readFile} from 'node:fs/promises';

const uid='synthetic-imile-v1-admin-0000001';
const email='imilemanagement@imile-management-staging.firebaseapp.com';

async function main(){
  const raw=await readFile(new URL('../depokapacitas/firestore-v1-restricted.rules',import.meta.url),'utf8');
  const env=await initializeTestEnvironment({
    projectId:'demo-imile-restricted-v1',
    firestore:{host:'127.0.0.1',port:8787,rules:raw.replaceAll('REPLACE_WITH_REAL_SHARED_UID',uid)}
  });
  const client=env.authenticatedContext(uid,{email}).firestore();
  try{
    await env.withSecurityRulesDisabled(async ctx=>{
      const db=ctx.firestore();
      await setDoc(doc(db,'users',uid),{active:true,role:'admin'});
      await setDoc(doc(db,'flottaDrivers','DA0001'),{
        daCode:'DA0001',status:'aktiv',kapacitas:80,revision:1,sourceIndex:0,history:[]
      });
    });

    // Client edit of sourceIndex must be denied
    await assertFails(updateDoc(doc(client,'flottaDrivers','DA0001'),{sourceIndex:1,revision:2}));

    // Forged claim documents
    await assertFails(setDoc(doc(client,'flottaDriverClaims','DA0001'),{driverId:'DA0001',claimed:true}));
    await assertFails(setDoc(doc(client,'flottaVehicleClaims','ABC123'),{plate:'ABC123',claimed:true}));

    // Stable identity drift
    await assertFails(updateDoc(doc(client,'flottaDrivers','DA0001'),{daCode:'DA0002',revision:2}));

    console.log('PASS: additional #184 SDK denial probes (sourceIndex, claims, identity drift)');
  }finally{
    await env.cleanup();
  }
}
main().catch(e=>{console.error(e);process.exit(1);});
