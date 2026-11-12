/**
 * Genuine two/three SEPARATE Node OS process Firestore SDK high-water tests.
 * One shared demo emulator, real original full restricted Rules, real root
 * Ed25519 signatures, no private keys sent to workers.
 *
 * Both true guarantee and crucial bypass proven:
 *  - local transactional signed registry sequence survives worker restart;
 *  - Admin-SDK-equivalent TEST-ONLY privileged rewrite can roll it back.
 * The latter is an explicit reason production IAM/seal must remain NO-GO.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {fork} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {readFile} from 'node:fs/promises';
import {generateKeyPairSync,createHash,sign as cryptoSign} from 'node:crypto';
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing';
import {doc,setDoc} from 'firebase/firestore';
import {canonicalStringify} from '../../../features/migration-manifest.mjs';

const projectId='demo-imile-v1-registry-highwater';
const uid='synthetic-imile-v1-registry-admin-0001';
const workerPath=fileURLToPath(new URL('./v1-registry-highwater-os-worker.mjs',import.meta.url));
const timeout=30000;
const fp=publicKey=>createHash('sha256').update(
  publicKey.export({format:'der',type:'spki'})
).digest('hex');
const publicSpki=publicKey=>publicKey.export({format:'der',type:'spki'}).toString('base64');
const sign=(payload,privateKey)=>({
  algorithm:'Ed25519',payload,
  signatureBase64:cryptoSign(null,Buffer.from(canonicalStringify(payload),'utf8'),
    privateKey).toString('base64')
});
if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8787'||
  process.env.GOOGLE_APPLICATION_CREDENTIALS||
  process.env.FIREBASE_SERVICE_ACCOUNT)
  throw Error('MANDATORY_LOCAL_FIRESTORE_EMULATOR_NO_SKIP');
const original=await readFile(
  new URL('../../../depokapacitas/firestore-v1-restricted.rules',import.meta.url),'utf8'
);
assert.ok(original.includes('REPLACE_WITH_REAL_SHARED_UID'));
const env=await initializeTestEnvironment({
  projectId,firestore:{
    host:'127.0.0.1',port:8787,
    rules:original.replaceAll('REPLACE_WITH_REAL_SHARED_UID',uid)
  }
});
const makeKeys=()=>{
  const root=generateKeyPairSync('ed25519');
  const signer=generateKeyPairSync('ed25519');
  const fingerprint=fp(signer.publicKey);
  const now=Date.now();
  const window={notBeforeMs:now-120000,expiresAtMs:now+3600000};
  return {root,signer,fingerprint,
    rootSpki:publicSpki(root.publicKey),rootPin:fp(root.publicKey),
    window};
};
const registry=(keys,sequence,revoked=[],override={})=>{
  const payload={
    schema:'imile-v1-offline-owner-signer-registry-v1',
    purpose:'synthetic-root-signed-fleet-manifest-registry',
    registryAudience:'demo-imile-v1-owner-registry',
    sourceProjectId:projectId,sequence,...keys.window,
    signers:[{
      signerId:'local-test-owner',keyVersion:1,
      publicKeySpkiBase64:publicSpki(keys.signer.publicKey),
      status:'active',...keys.window
    }],
    revokedSignerFingerprints:revoked,...override
  };
  return sign(payload,keys.root.privateKey);
};
const withTimeout=(promise,label)=>new Promise((resolve,reject)=>{
  const guard=setTimeout(()=>reject(Error('OS_IPC_TIMEOUT: '+label)),timeout);
  promise.then(v=>{clearTimeout(guard);resolve(v)},
    e=>{clearTimeout(guard);reject(e)});
});
async function startWorker(keys){
  const child=fork(workerPath,[],{
    env:{...process.env,FIRESTORE_EMULATOR_HOST:'127.0.0.1:8787',
      V1_DEMO_ROOT_SPKI:keys.rootSpki,V1_DEMO_ROOT_SHA:keys.rootPin},
    stdio:['ignore','pipe','pipe','ipc'],execArgv:[]
  });
  let next=0,dead=false,stderr='';
  const wait=new Map();
  let readyResolve,readyReject;
  const ready=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject});
  child.stderr.on('data',data=>{stderr+=String(data).slice(0,15000)});
  child.on('message',msg=>{
    if(msg?.type==='ready')return readyResolve(msg.pid);
    if(msg?.type==='response'){
      const item=wait.get(msg.reqId);
      if(item){wait.delete(msg.reqId);item.resolve(msg.response)}
    }
  });
  child.on('error',e=>{
    readyReject(e);
    for(const w of wait.values())w.reject(e);
    wait.clear();
  });
  child.on('exit',(code,signal)=>{
    dead=true;
    const e=Error('CHILD_EXIT: '+JSON.stringify({code,signal,stderr:stderr.slice(-3500)}));
    readyReject(e);
    for(const w of wait.values())w.reject(e);
    wait.clear();
  });
  const pid=await withTimeout(ready,'WORKER_READY');
  const call=(command,extra={})=>withTimeout(new Promise((resolve,reject)=>{
    if(dead||!child.connected)return reject(Error('WORKER_DEAD'));
    const reqId=++next;
    wait.set(reqId,{resolve,reject});
    child.send({reqId,command,...extra},e=>{
      if(e){wait.delete(reqId);reject(e)}
    });
  }),'WORKER_'+command);
  const close=async()=>{
    if(dead)return;
    try{await call('exit')}catch{}
    if(!dead){
      try{child.disconnect()}catch{}
      child.kill('SIGTERM');
    }
  };
  return {pid,call,close};
}
const good=result=>{
  assert.equal(result.ok,true,JSON.stringify(result));
  assert.equal(result.sealed,false);
  assert.equal(result.canSeal,false);
  assert.equal(result.authorizedForImport,false);
  assert.equal(result.productionIamVerified,false);
  assert.equal(result.externalTrustRootAuthenticityVerified,false);
  assert.equal(result.externallyAuthenticatedDurableHighWaterVerified,false);
};
const reject=(r,regex)=>{
  assert.equal(r.ok,false,JSON.stringify(r));
  assert.equal(r.canSeal,false);
  assert.equal(r.authorizedForImport,false);
  assert.equal(r.productionIamVerified,false);
  if(regex)assert.match(r.reason,regex);
};
async function withWorkers(fn){
  await env.clearFirestore();
  const keys=makeKeys(),children=[];
  try{
    const a=await startWorker(keys);children.push(a);
    const b=await startWorker(keys);children.push(b);
    assert.notEqual(a.pid,b.pid);
    assert.notEqual(a.pid,process.pid);
    assert.notEqual(b.pid,process.pid);
    await fn({a,b,keys,children,spawn:async()=>{
      const c=await startWorker(keys);children.push(c);return c;
    }});
  }finally{
    for(const c of children.reverse())await c.close();
  }
}
try {
  await test('two OS processes + third after restart: signed root seq/revocation high-water persists and stale signed registry is refused',async()=>{
    await withWorkers(async({a,b,keys,spawn})=>{
      const seq1=registry(keys,1,[]);
      const seq2=registry(keys,2,[keys.fingerprint]);
      const seq3=registry(keys,3,[keys.fingerprint,'f'.repeat(64)]);
      const old=await a.call('adopt',{bundle:seq1});
      good(old);assert.equal(old.sequence,1);
      assert.equal(old.persistedRevision,1);
      const oldState=(await a.call('state')).state;
      assert.equal(oldState.sequence,1);

      // Original restricted Rules must DENY signed-in browser SDK writes.
      const client=env.authenticatedContext(uid,{
        email:'imilemanagement@imile-management-staging.firebaseapp.com'
      }).firestore();
      await assertFails(setDoc(
        doc(client,'v1SyntheticOwnerRegistryHighwater','current'),
        {sequence:500,revokedSignerFingerprints:[],syntheticOnly:true}
      ));
      console.log('PASS DENY [E+original Rules]: signed-in browser cannot forge high-water document');

      const next=await b.call('adopt',{bundle:seq2});
      good(next);assert.equal(next.sequence,2);
      assert.equal(next.persistedRevision,2);
      reject(await a.call('verify',{bundle:seq1}),
        /STALE_SIGNED_REGISTRY_AFTER_DURABLE_ADVANCE/);
      reject(await a.call('adopt',{bundle:seq1}),
        /STALE_SIGNED_REGISTRY_AFTER_DURABLE_ADVANCE/);

      // A genuine new OS process, fresh JS memory, must observe persisted
      // seq2 even though its local contract has never seen seq1 or seq2.
      const c=await spawn();
      assert.notEqual(c.pid,a.pid);assert.notEqual(c.pid,b.pid);
      reject(await c.call('adopt',{bundle:seq1}),
        /STALE_SIGNED_REGISTRY_AFTER_DURABLE_ADVANCE/);
      good(await c.call('verify',{bundle:seq2}));
      reject(await c.call('adopt',{bundle:registry(keys,3,[])}),
        /SIGNED_REVOCATION_SET_ROLLBACK_DENIED/);

      // Bogus root signature, no matter what sequence it claims, DENY
      // before any high-water change.
      const attacker=generateKeyPairSync('ed25519');
      const forged=sign({...seq3.payload,sequence:99},attacker.privateKey);
      reject(await a.call('adopt',{bundle:forged}),/REGISTRY_ED25519_SIGNATURE_INVALID/);
      good(await b.call('adopt',{bundle:seq3}));
      reject(await c.call('verify',{bundle:seq2}),
        /STALE_SIGNED_REGISTRY_AFTER_DURABLE_ADVANCE/);
      good(await a.call('verify',{bundle:seq3}));
      const state3=(await b.call('state')).state;
      assert.equal(state3.sequence,3);
      assert.equal(state3.revision,3);
      assert.deepEqual(state3.revokedSignerFingerprints,
        [keys.fingerprint,'f'.repeat(64)].sort());
      reject(await b.call('seal'),/REAL_SIGNER_IAM_AND_ATOMIC_SEAL_UNAVAILABLE/);
      console.log('PASS [E+3 OS processes]: root-signed registry durable seq3 survives fresh process; stale/revoked signer registry DENY');

      // CRITICAL UNSOLVED SECURITY BOUNDARY: privileged test-only Admin
      // SDK equivalence can simply rewrite the persisted high-water.
      assert.equal((await b.call('overrideTestOnly',{
        overrideDoc:oldState
      })).testOnlyPrivilegedBypass,true);
      const afterBypass=await c.call('verify',{bundle:seq1});
      good(afterBypass); // This IS the limitation, not a release success!
      assert.equal((await c.call('state')).state.sequence,1);
      reject(await c.call('seal'),/REAL_SIGNER_IAM_AND_ATOMIC_SEAL_UNAVAILABLE/);
      console.log('PASS VULNERABILITY PROOF [E+3 OS processes]: privileged bypass rewrote high-water from seq3 to seq1; old root-signed signer accepted again; FULL V1 NO-GO');
    });
  });

  await test('two separate OS processes race different root-signed registries for same sequence; exactly one durable digest wins',async()=>{
    await withWorkers(async({a,b,keys,spawn})=>{
      good(await a.call('adopt',{bundle:registry(keys,1,[])}));
      const left=registry(keys,2,[keys.fingerprint]);
      const right=registry(keys,2,['a'.repeat(64)]);
      const results=await Promise.all([
        a.call('adopt',{bundle:left}),
        b.call('adopt',{bundle:right})
      ]);
      assert.equal(results.filter(x=>x.ok).length,1,JSON.stringify(results));
      assert.equal(results.filter(x=>!x.ok).length,1,JSON.stringify(results));
      reject(results.find(x=>!x.ok),
        /SAME_SEQUENCE_SIGNED_REGISTRY_EQUIVOCATION|TRANSACTION/);
      const winner=results[0].ok?left:right;
      const loser=results[0].ok?right:left;
      const state=(await b.call('state')).state;
      assert.equal(state.sequence,2);
      assert.equal(state.revision,2);
      const c=await spawn();
      good(await c.call('verify',{bundle:winner}));
      reject(await c.call('verify',{bundle:loser}),
        /SAME_SEQUENCE_SIGNED_REGISTRY_EQUIVOCATION/);
      console.log('PASS DENY [E+3 OS processes]: real concurrent same-sequence signed equivocation, one durable digest winner, fresh-process loser DENY');
    });
  });

  console.log(JSON.stringify({
    verdict:'SCOPED_REAL_NODE_PROCESSES_PERSISTED_EMULATOR_REGISTRY_ONLY',
    separateNodeOSProcesses:true,originalFullRules:true,
    realFirestoreTransactions:true,signedRegistryRootEd25519:true,
    staleAfterRestartDenied:true,sameSequenceEquivocationDenied:true,
    signedRevocationMonotonic:true,
    privilegedBypassPermitsRollback:true,
    externalTrustRootAuthenticityVerified:false,
    productionIamVerified:false,privilegedWriterIsolationVerified:false,
    ownerApprovalAuthenticated:false,canSeal:false,sealed:false,
    fullV1:'NO_GO_P0_POISONED_PRIVILEGED_SOURCE'
  }));
} finally {
  await env.cleanup();
}
