/**
 * Spawned, separate Node OS test-only worker: ONE shared demo Firestore.
 * Ed25519 root PUBLIC key/pin are passed by parent. No private key.
 * withSecurityRulesDisabled is a TEST EMULATOR privilege bypass, NOT IAM.
 */
import {readFile} from 'node:fs/promises';
import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import {doc,getDoc,setDoc} from 'firebase/firestore';
import {createLocalSignedRegistryHighwater} from './v1-local-durable-signed-registry.mjs';

const projectId='demo-imile-v1-registry-highwater';
const uid='synthetic-imile-v1-registry-admin-0001';
if(!process.send||process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8787'||
  process.env.GOOGLE_APPLICATION_CREDENTIALS||
  process.env.FIREBASE_SERVICE_ACCOUNT||
  !process.env.V1_DEMO_ROOT_SPKI||!process.env.V1_DEMO_ROOT_SHA)
  throw Error('EXACT_DEMO_EMULATOR_IPC_AND_PUBLIC_ROOT_REQUIRED');
const original=await readFile(
  new URL('../../../depokapacitas/firestore-v1-restricted.rules',import.meta.url),
  'utf8'
);
if(!original.includes('REPLACE_WITH_REAL_SHARED_UID'))
  throw Error('ORIGINAL_RESTRICTED_RULES_UNAVAILABLE');
const env=await initializeTestEnvironment({
  projectId,firestore:{
    host:'127.0.0.1',port:8787,
    rules:original.replaceAll('REPLACE_WITH_REAL_SHARED_UID',uid)
  }
});
let close=false;
await env.withSecurityRulesDisabled(async context=>{
  const db=context.firestore();
  const gate=createLocalSignedRegistryHighwater({
    db,projectId,
    rootPublicKeySpkiBase64:process.env.V1_DEMO_ROOT_SPKI,
    independentlyPinnedRootSha256:process.env.V1_DEMO_ROOT_SHA,
    expectedRegistryAudience:'demo-imile-v1-owner-registry'
  });
  process.send({type:'ready',pid:process.pid});
  await new Promise(resolve=>{
    process.on('disconnect',resolve);
    process.on('message',async request=>{
      const {reqId,command,bundle,overrideDoc}=request||{};
      let response;
      try{
        switch(command){
          case 'adopt':
            response=await gate.adoptRootSignedRegistry(bundle);
            break;
          case 'verify':
            response=await gate.verifyCurrentRootSignedRegistry(bundle);
            break;
          case 'state':{
            const snap=await getDoc(
              doc(db,'v1SyntheticOwnerRegistryHighwater','current')
            );
            response={ok:true,state:snap.exists()?snap.data():null};
            break;
          }
          case 'overrideTestOnly':
            // Explicitly demonstrates privileged Admin SDK style bypass
            // against a naive Firestore doc high-water. NEVER in production.
            if(!overrideDoc||overrideDoc.syntheticOnly!==true)
              throw Error('BAD_SYNTHETIC_PRIVILEGED_ATTACK_DOCUMENT');
            await setDoc(doc(db,'v1SyntheticOwnerRegistryHighwater','current'),overrideDoc);
            response={ok:true,testOnlyPrivilegedBypass:true};
            break;
          case 'seal':
            response=await gate.seal();
            break;
          case 'exit':
            response={ok:true,exiting:true};
            close=true;
            break;
          default:
            throw Error('UNKNOWN_TEST_ONLY_IPC_COMMAND');
        }
      }catch(error){
        response={ok:false,reason:'TEST_WORKER_EXCEPTION: '+String(error.message||error)};
      }
      if(process.connected)process.send({
        type:'response',reqId,response:structuredClone(response)
      });
      if(close)resolve();
    });
  });
});
await env.cleanup();
process.exit(0);
