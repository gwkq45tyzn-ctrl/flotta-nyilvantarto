/**
 * Real independent Node OS process, original Rules + same demo Firestore.
 * TEST-ONLY privileged emulator bypass. NO real IAM or private signer keys.
 */
import {readFile} from 'node:fs/promises';
import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import {doc,getDoc,setDoc,updateDoc} from 'firebase/firestore';
import {createLocalSignedRegistryHighwater} from './v1-local-durable-signed-registry.mjs';
import {createLocalSignedSourceEpochBinding} from './v1-local-signed-source-epoch-binding.mjs';
import {createLocalFencedRichKeyedImporter} from './v1-fenced-rich-keyed-importer.mjs';
import {makeSyntheticSignedFleet,PROJECT_ID,REGISTRY_AUDIENCE,SIGNER_ID} from './v1-signed-source-test-fixture.mjs';
import {sha256,simulateBackup} from '../../../tools/v1-migration-dryrun.mjs';
const uid='synthetic-imile-v1-source-epoch-admin-001';
if(!process.send||process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8787'||
   !process.env.V1_DEMO_ROOT_SPKI||!process.env.V1_DEMO_ROOT_SHA||
   process.env.GOOGLE_APPLICATION_CREDENTIALS||
   process.env.FIREBASE_SERVICE_ACCOUNT)
  throw Error('LOCAL_DEMO_IPC_WORKER_REQUIRED');
const original=await readFile(new URL(
  '../../../depokapacitas/firestore-v1-restricted.rules',import.meta.url),'utf8');
if(!original.includes('REPLACE_WITH_REAL_SHARED_UID'))
  throw Error('ORIGINAL_RESTRICTED_RULES_MISSING');
const env=await initializeTestEnvironment({
  projectId:PROJECT_ID,firestore:{
    host:'127.0.0.1',port:8787,
    rules:original.replaceAll('REPLACE_WITH_REAL_SHARED_UID',uid)
  }
});
let closing=false,importer=null;
const source=makeSyntheticSignedFleet();
const backup=simulateBackup(source);
const pin=sha256(source);
await env.withSecurityRulesDisabled(async ctx=>{
  const db=ctx.firestore();
  const opts={
    db,projectId:PROJECT_ID,
    rootPublicKeySpkiBase64:process.env.V1_DEMO_ROOT_SPKI,
    independentlyPinnedRootSha256:process.env.V1_DEMO_ROOT_SHA,
    expectedRegistryAudience:REGISTRY_AUDIENCE
  };
  const registry=createLocalSignedRegistryHighwater(opts);
  const gate=createLocalSignedSourceEpochBinding({
    ...opts,expectedSignerId:SIGNER_ID,expectedRevision:1
  });
  process.send({type:'ready',pid:process.pid});
  await new Promise(resolve=>{
    process.on('disconnect',resolve);
    process.on('message',async request=>{
      const {reqId,command,bundle,manifest,epoch,pinOverride,tamperSnapshot,
        claimPath,registryOverride}=request||{};
      let answer;
      try{
        switch(command){
          case 'adopt':
            answer=await registry.adoptRootSignedRegistry(bundle);break;
          case 'begin':
            if(!importer)importer=createLocalFencedRichKeyedImporter({
              db,projectId:PROJECT_ID,trustedPinnedSha:pin,expectedRevision:1
            });
            answer=await importer.begin(source,backup);break;
          case 'apply':
            answer=importer?await importer.applyBatch([
              'drivers/DA0001','drivers/DA0002','vehicles/ABC123'
            ]):{ok:false,reason:'NO_IMPORTER'};break;
          case 'bind':{
            const raw=structuredClone(source);
            if(tamperSnapshot)raw.drivers[0].history[0].metadata.nested[0].unicode='FORGED';
            answer=await gate.inspectAndBind({
              registryBundle:bundle,manifest,
              snapshot:raw,backup,
              expectedEpoch:epoch,
              independentlyPinnedSourceSha256:pinOverride??pin
            });break;
          }
          case 'state':{
            const output={};
            for(const [alias,path] of [
              ['highwater','v1SyntheticOwnerRegistryHighwater/current'],
              ['lock','v1MigrationSyntheticLocks/primary'],
              ['receipt','v1SyntheticSignedSourceEpochBindings/current']
            ]){
              const snap=await getDoc(doc(db,path));
              output[alias]=snap.exists()?snap.data():null;
            }
            answer={ok:true,state:output};break;
          }
          case 'tamperClaimTestOnly':
            if(claimPath!=='flottaDriverClaims/DA0001')
              throw Error('BAD_TEST_ONLY_TARGET_CLAIM');
            await updateDoc(doc(db,claimPath),{masterSha256:'f'.repeat(64)});
            answer={ok:true,privilegedTestBypass:true};break;
          case 'resetHighwaterTestOnly':
            if(!registryOverride||registryOverride.syntheticOnly!==true)
              throw Error('BAD_TEST_ONLY_RESET_STATE');
            await setDoc(doc(db,'v1SyntheticOwnerRegistryHighwater','current'),
              registryOverride);
            answer={ok:true,privilegedTestBypass:true};break;
          case 'seal':
            answer=await gate.seal();break;
          case 'exit':
            answer={ok:true,exiting:true};closing=true;break;
          default:
            throw Error('UNRECOGNIZED_DEMO_IPC_ACTION');
        }
      }catch(e){
        answer={ok:false,reason:'WORKER_ERROR: '+String(e.message||e)};
      }
      if(process.connected)process.send({
        type:'response',reqId,answer:structuredClone(answer)
      });
      if(closing)resolve();
    });
  });
});
await env.cleanup();
process.exit(0);
