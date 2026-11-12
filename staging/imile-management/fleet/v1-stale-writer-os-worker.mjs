/**
 * Genuine separately spawned Node OS PROCESS worker talking over IPC.
 * Every command calls real Firestore SDK transactions against the same
 * demo-... emulator. No production credential, IAM, secret or cloud access.
 *
 * This is a TEST WORKER only: withSecurityRulesDisabled is a local emulator
 * fixture, NEVER an eligible production server privileged importer.
 */
import {readFile} from 'node:fs/promises';
import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import {doc,getDoc,getDocs,collection,setDoc,updateDoc} from 'firebase/firestore';
import {createLocalFencedRichKeyedImporter} from './v1-fenced-rich-keyed-importer.mjs';
import {createDemoManualPresealRecovery} from './v1-demo-manual-preseal-recovery.mjs';
import {createSyntheticStaleWriterSource} from './v1-multiprocess-test-fixture.mjs';
import {sha256,simulateBackup} from '../../../tools/v1-migration-dryrun.mjs';

const projectId='demo-imile-v1-two-process-stale';
const uid='synthetic-imile-v1-two-process-admin-0001';
const port=8787,host='127.0.0.1';
if(!process.send||process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8787'||
   process.env.GOOGLE_APPLICATION_CREDENTIALS||
   process.env.FIREBASE_SERVICE_ACCOUNT)
  throw Error('EXACT_SYNTHETIC_EMULATOR_IPC_WORKER_REQUIRED');

const raw=createSyntheticStaleWriterSource();
const backup=simulateBackup(raw);
const pinned=sha256(raw);
const rawRules=await readFile(
  new URL('../../../depokapacitas/firestore-v1-restricted.rules',import.meta.url),'utf8');
if(!rawRules.includes('REPLACE_WITH_REAL_SHARED_UID'))
  throw Error('ORIGINAL_RESTRICTED_RULES_UNAVAILABLE');
const env=await initializeTestEnvironment({
  projectId,firestore:{host,port,
    rules:rawRules.replaceAll('REPLACE_WITH_REAL_SHARED_UID',uid)}
});
let importer=null,recovery=null,closing=false;
function safe(result){
  return structuredClone(result);
}
await env.withSecurityRulesDisabled(async ctx=>{
  const db=ctx.firestore();
  const importerFactory=()=>createLocalFencedRichKeyedImporter({
    db,projectId,trustedPinnedSha:pinned,expectedRevision:1
  });
  const recoveryFactory=()=>createDemoManualPresealRecovery({
    db,projectId,trustedPinnedSha:pinned,expectedRevision:1
  });
  process.send({type:'ready',pid:process.pid});
  await new Promise((resolve,reject)=>{
    process.on('disconnect',resolve);
    process.on('message',async request=>{
      const {reqId,command,ids,epoch,limit,claimPath,claimData}=request||{};
      let response;
      try{
        switch(command){
          case 'begin':
            if(!importer)importer=importerFactory();
            response=await importer.begin(raw,backup);
            break;
          case 'apply':
            response=importer
              ?await importer.applyBatch(ids)
              :{ok:false,reason:'NO_IMPORTER'};
            break;
          case 'seal':
            response=importer
              ?await importer.seal()
              :{ok:false,reason:'NO_IMPORTER'};
            break;
          case 'claimRecovery':
            if(!recovery)recovery=recoveryFactory();
            response=await recovery.claimAbandoned(raw,backup,{
              manualApproval:true,expectedAbandonedEpoch:epoch
            });
            break;
          case 'rollback':
            response=recovery
              ?await recovery.rollbackBatch(limit)
              :{ok:false,reason:'NO_RECOVERY'};
            break;
          case 'counts':{
            const ls=await getDoc(doc(db,'v1MigrationSyntheticLocks','primary'));
            const sizes={};
            for(const name of [
              'flottaDrivers','flottaVehicles',
              'flottaDriverClaims','flottaVehicleClaims'
            ])sizes[name]=(await getDocs(collection(db,name))).size;
            response={ok:true,lock:ls.exists()?ls.data():null,sizes};
            break;
          }
          case 'injectTestOnlyClaim':{
            // Emulates an out-of-band malicious privileged write. It is
            // NEVER a production implementation or approved importer action.
            if(typeof claimPath!=='string'||
              !/^flottaDriverClaims\/DA[0-9]{4}$/.test(claimPath))
              throw Error('BAD_SYNTHETIC_CLAIM_PATH');
            await setDoc(doc(db,claimPath),claimData);
            response={ok:true,testOnlySyntheticBypass:true};
            break;
          }
          case 'tamperTestOnlyClaim':{
            if(typeof claimPath!=='string'||
              !/^flottaDriverClaims\/DA[0-9]{4}$/.test(claimPath))
              throw Error('BAD_SYNTHETIC_CLAIM_PATH');
            await updateDoc(doc(db,claimPath),{masterSha256:'f'.repeat(64)});
            response={ok:true,testOnlySyntheticBypass:true};
            break;
          }
          case 'exit':
            response={ok:true,exiting:true};
            closing=true;
            break;
          default:
            throw Error('UNKNOWN_IPC_TEST_OPERATION');
        }
      }catch(e){
        response={ok:false,reason:'TEST_WORKER_ERROR: '+String(e.message||e)};
      }
      if(process.connected)process.send({type:'response',reqId,response:safe(response)});
      if(closing)resolve();
    });
  });
});
await env.cleanup();
process.exit(0);
