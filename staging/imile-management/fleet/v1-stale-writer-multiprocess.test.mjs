/**
 * Genuine two-SEPARATE-Node-OS-PROCESS stale writer / forge / interrupted
 * recovery tests, both talking to one real Firestore DEMO emulator and
 * using ORIGINAL full restricted Rules for signed-in browser SDK.
 *
 * No silent skip. NO production cloud/IAM/signed source/release approval.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {fork} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {readFile} from 'node:fs/promises';
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing';
import {doc,getDoc,getDocs,setDoc,collection} from 'firebase/firestore';

const projectId='demo-imile-v1-two-process-stale',host='127.0.0.1',port=8787;
const uid='synthetic-imile-v1-two-process-admin-0001';
const email='imilemanagement@imile-management-staging.firebaseapp.com';
const workerFile=fileURLToPath(new URL('./v1-stale-writer-os-worker.mjs',import.meta.url));
const lockPath='v1MigrationSyntheticLocks/primary';
const timeout=30000;
if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8787'||
  process.env.GOOGLE_APPLICATION_CREDENTIALS||
  process.env.FIREBASE_SERVICE_ACCOUNT)
  throw Error('EMULATOR_REQUIRED_NO_TEST_SKIP');
const original=await readFile(
  new URL('../../../depokapacitas/firestore-v1-restricted.rules',import.meta.url),'utf8');
assert.ok(original.includes('REPLACE_WITH_REAL_SHARED_UID'));
const env=await initializeTestEnvironment({projectId,firestore:{
  host,port,rules:original.replaceAll('REPLACE_WITH_REAL_SHARED_UID',uid)
}});
const delayLimit=(promise,label)=>new Promise((resolve,reject)=>{
  const guard=setTimeout(()=>reject(Error('TIMED_OUT: '+label)),timeout);
  promise.then(x=>{clearTimeout(guard);resolve(x)},
    err=>{clearTimeout(guard);reject(err)});
});
async function newWorker(){
  const child=fork(workerFile,[],{
    env:{...process.env,FIRESTORE_EMULATOR_HOST:'127.0.0.1:8787'},
    stdio:['ignore','pipe','pipe','ipc'],
    execArgv:[]
  });
  let next=0;
  const waiting=new Map();
  let readyResolve,readyReject,dead=false;
  let stderr='';
  const ready=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject});
  child.stderr.on('data',data=>{stderr+=String(data).slice(0,20000)});
  child.on('message',msg=>{
    if(msg?.type==='ready')return readyResolve(msg.pid);
    if(msg?.type==='response'){
      const w=waiting.get(msg.reqId);if(!w)return;
      waiting.delete(msg.reqId);w.resolve(msg.response);
    }
  });
  child.on('error',error=>{
    readyReject(error);
    for(const w of waiting.values())w.reject(error);
    waiting.clear();
  });
  child.on('exit',(code,signal)=>{
    dead=true;
    const error=Error('WORKER_EXIT '+JSON.stringify({code,signal,stderr:stderr.slice(-3000)}));
    readyReject(error);
    for(const w of waiting.values())w.reject(error);
    waiting.clear();
  });
  const pid=await delayLimit(ready,'IPC_WORKER_READY');
  const call=(command,args={})=>delayLimit(new Promise((resolve,reject)=>{
    if(dead||!child.connected)return reject(Error('WORKER_UNAVAILABLE'));
    const reqId=++next;
    waiting.set(reqId,{resolve,reject});
    child.send({reqId,command,...args},e=>{
      if(e){waiting.delete(reqId);reject(e)}
    });
  }),'IPC_'+command);
  const close=async()=>{
    if(dead)return;
    try{await call('exit')}catch{}
    if(!dead){
      try{child.disconnect()}catch{}
      // Ensure no background workers survive. This is local CI cleanup.
      child.kill('SIGTERM');
    }
  };
  return {pid,call,close};
}
const approved=r=>{
  assert.equal(r.ok,true,JSON.stringify(r));
  assert.equal(r.sealed,false);
  assert.equal(r.authorizedForImport,false);
  assert.equal(r.productionIamVerified,false);
};
const refused=(r,re)=>{
  assert.equal(r.ok,false,JSON.stringify(r));
  assert.equal(r.sealed,false);
  assert.equal(r.authorizedForImport,false);
  if(re)assert.match(r.reason,re);
};
async function withWorkers(run){
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async c=>{
    await setDoc(doc(c.firestore(),'users',uid),{
      active:true,role:'admin',name:'NO_REAL_USER'
    });
  });
  const workers=[];
  try{
    const a=await newWorker();workers.push(a);
    const b=await newWorker();workers.push(b);
    assert.notEqual(a.pid,b.pid);
    assert.notEqual(a.pid,process.pid);
    assert.notEqual(b.pid,process.pid);
    await run(a,b);
  }finally{
    for(const w of workers.reverse())await w.close();
  }
}
try{
  await test('real OS A/B: one persistent epoch, stale writer after manual recovery loses master+claim write privilege',async()=>{
    await withWorkers(async(a,b)=>{
      const start=await a.call('begin');
      approved(start);assert.equal(start.epoch,1);
      const item=await a.call('apply',{ids:['drivers/DA0000']});
      approved(item);
      assert.equal(item.persistedKeyedRecordsVerified,true);
      refused(await b.call('begin'),/ACTIVE_EPOCH_HELD/);
      const recovering=await b.call('claimRecovery',{epoch:1});
      approved(recovering);assert.equal(recovering.epoch,2);
      refused(await a.call('apply',{ids:['drivers/DA0001']}),/BATCH_DENIED/);
      const cp=await b.call('counts');
      assert.equal(cp.lock.phase,'recovering');
      assert.equal(cp.lock.epoch,2);
      assert.deepEqual(cp.lock.verifiedIds,['drivers/DA0000']);
      assert.equal(cp.sizes.flottaDrivers,1);
      assert.equal(cp.sizes.flottaDriverClaims,1);
      const rollback=await b.call('rollback',{limit:1});
      approved(rollback);assert.equal(rollback.complete,true);
      const empty=await a.call('counts');
      assert.equal(empty.lock.phase,'released');
      assert.equal(empty.sizes.flottaDrivers,0);
      assert.equal(empty.sizes.flottaDriverClaims,0);
      refused(await a.call('apply',{ids:['drivers/DA0002']}),/NO_ACTIVE|BATCH_DENIED/);
      refused(await a.call('seal'),/SEAL_REFUSED/);
      console.log('PASS [E+2 OS processes]: old epoch-1 real write DENIED after epoch-2 transactional takeover; atomic rich master+claim rollback');
    });
  });
  await test('two real OS processes: interruption during bounded rollback cannot silently auto-release or steal',async()=>{
    await withWorkers(async(a,b)=>{
      approved(await a.call('begin'));
      approved(await a.call('apply',{
        ids:Array.from({length:24},(_,i)=>'drivers/DA'+String(i).padStart(4,'0'))
      }));
      approved(await a.call('apply',{
        ids:Array.from({length:6},(_,i)=>'drivers/DA'+String(i+24).padStart(4,'0'))
      }));
      approved(await b.call('claimRecovery',{epoch:1}));
      const rollback=await b.call('rollback',{limit:10});
      approved(rollback);assert.equal(rollback.complete,false);
      assert.equal(rollback.remaining,20);
      const state=await a.call('counts');
      assert.equal(state.lock.phase,'recovering');
      assert.equal(state.lock.verifiedIds.length,20);
      assert.equal(state.sizes.flottaDrivers,20);
      assert.equal(state.sizes.flottaDriverClaims,20);
      // Child B exits (simulated process crash) mid-recovery; A's stale
      // imported writer can still NOT continue or change the journal.
      await b.close();
      refused(await a.call('apply',{ids:['vehicles/PL0000']}),/BATCH_DENIED/);
      // A third truly new OS process still cannot steal the recovering
      // lease or silently auto-resume from incomplete rollback.
      const fresh=await newWorker();
      try{
        refused(await fresh.call('begin'),/INVALID_PREVIOUS_FENCING_STATE|ACQUIRE_DENIED/);
        const unchanged=await fresh.call('counts');
        assert.equal(unchanged.lock.phase,'recovering');
        assert.equal(unchanged.lock.verifiedIds.length,20);
        assert.equal(unchanged.sizes.flottaDrivers,20);
        assert.equal(unchanged.sizes.flottaDriverClaims,20);
      }finally{await fresh.close()}
      console.log('PASS [E+3 OS processes]: partial real rollback retained and locked without auto-steal; stale master/claim write DENIED');
    });
  });
  await test('real SDK forged next claim and modified existing immutable claim reject entire batch and preserve evidence',async()=>{
    await withWorkers(async(a,b)=>{
      approved(await a.call('begin'));
      approved(await a.call('apply',{ids:['drivers/DA0000']}));
      // A separate OS test process simulates a malicious extra privileged
      // claim for the NEXT intended batch, not just a hardcoded result.
      assert.equal((await b.call('injectTestOnlyClaim',{
        claimPath:'flottaDriverClaims/DA0001',
        claimData:{sourceIndex:1,masterSha256:'f'.repeat(64),
          revision:1,migrationSourceSha256:'f'.repeat(64)}
      })).ok,true);
      refused(await a.call('apply',{ids:['drivers/DA0001']}),/UNEXPECTED_EXISTING_MASTER_OR_CLAIM/);
      const unchanged=await b.call('counts');
      assert.deepEqual(unchanged.lock.verifiedIds,['drivers/DA0000']);
      assert.equal(unchanged.sizes.flottaDrivers,1);
      assert.equal(unchanged.sizes.flottaDriverClaims,2);
      // The unexpected claim is NOT automatically removed or trusted.
      // This is explicitly an unresolved recovery-inventory obligation.
      console.log('PASS DENY [E+2 OS processes]: forged target claim blocks actual second master+claim transaction, no partial master');
    });
  });
  await test('real SDK tampered previously verified claim blocks next batch and manual rollback',async()=>{
    await withWorkers(async(a,b)=>{
      approved(await a.call('begin'));
      approved(await a.call('apply',{ids:['drivers/DA0000']}));
      assert.equal((await b.call('tamperTestOnlyClaim',{
        claimPath:'flottaDriverClaims/DA0000'
      })).ok,true);
      refused(await a.call('apply',{ids:['drivers/DA0001']}),/PREVIOUS_VERIFIED_RICH_DOCUMENT_TAMPERED/);
      approved(await b.call('claimRecovery',{epoch:1}));
      refused(await b.call('rollback',{limit:1}),/RICH_MASTER_OR_IMMUTABLE_CLAIM_DRIFT/);
      const present=await b.call('counts');
      assert.equal(present.lock.phase,'recovering');
      assert.equal(present.lock.verifiedIds.length,1);
      assert.equal(present.sizes.flottaDrivers,1);
      assert.equal(present.sizes.flottaDriverClaims,1);
      console.log('PASS DENY [E+2 OS processes]: modified persisted claim freezes epoch-fenced rollback preserving evidence');
    });
  });

  // Explicit no-production-authority and no-live-cloud asserts.
  await env.withSecurityRulesDisabled(async privileged=>{
    const db=privileged.firestore();
    assert.equal((await getDoc(doc(db,'flottaMigrationApproval','current'))).exists(),false);
    assert.equal((await getDoc(doc(db,'flottaSharedState','current'))).exists(),false);
  });
  console.log(JSON.stringify({
    verdict:'SCOPED_TWO_REAL_NODE_PROCESSES_EMULATOR_ONLY',
    separateNodeProcessVerified:true,sameDatabase:true,
    staleSourceFenced:true,forgedClaimWriteDenied:true,
    tamperedClaimRollbackDenied:true,abandonedRollbackFailClosed:true,
    originalRestrictedRulesUsed:true,
    productionIamVerified:false,sourceSignerVerified:false,
    sealed:false,authorizedForImport:false
  }));
}finally{
  await env.cleanup();
}
