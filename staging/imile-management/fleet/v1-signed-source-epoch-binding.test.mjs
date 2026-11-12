/**
 * Real original Rules + 3 independently forked Node OS processes.
 * Two cryptographic Ed25519 signatures + full-rich source+backup + genuine
 * persisted root-signed registry seq + fenced epoch+claim/master receipt
 * checked in ONE transaction. NEVER a whole-namespace or production seal.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {fork} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {readFile} from 'node:fs/promises';
import {generateKeyPairSync,createHash,sign as cryptosign} from 'node:crypto';
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing';
import {doc,setDoc} from 'firebase/firestore';
import {canonicalStringify} from '../../../features/migration-manifest.mjs';
import {sha256,buildPlan} from '../../../tools/v1-migration-dryrun.mjs';
import {makeSyntheticSignedFleet,PROJECT_ID,REGISTRY_AUDIENCE,
  SIGNER_ID} from './v1-signed-source-test-fixture.mjs';

const workerFile=fileURLToPath(new URL('./v1-signed-source-os-worker.mjs',import.meta.url));
const uid='synthetic-imile-v1-source-epoch-admin-001';
const timeout=45000;
if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8787'||
   process.env.GOOGLE_APPLICATION_CREDENTIALS||
   process.env.FIREBASE_SERVICE_ACCOUNT)
  throw Error('MANDATORY_LOCAL_ONLY_FIRESTORE_EMULATOR');
const rules=await readFile(new URL(
  '../../../depokapacitas/firestore-v1-restricted.rules',import.meta.url),'utf8');
assert.ok(rules.includes('REPLACE_WITH_REAL_SHARED_UID'));
const env=await initializeTestEnvironment({
  projectId:PROJECT_ID,firestore:{
    host:'127.0.0.1',port:8787,
    rules:rules.replaceAll('REPLACE_WITH_REAL_SHARED_UID',uid)
  }
});
const spki=kp=>kp.publicKey.export({format:'der',type:'spki'});
const fingerprint=kp=>createHash('sha256').update(spki(kp)).digest('hex');
const signed=(payload,kp)=>({
  algorithm:'Ed25519',payload,
  signatureBase64:cryptosign(null,Buffer.from(canonicalStringify(payload),'utf8'),
    kp.privateKey).toString('base64')
});
function fixture(){
  const root=generateKeyPairSync('ed25519');
  const signer=generateKeyPairSync('ed25519');
  const source=makeSyntheticSignedFleet();
  const now=Date.now();
  const interval={notBeforeMs:now-120000,expiresAtMs:now+3600000};
  const registry=(sequence,revoked=[])=>signed({
    schema:'imile-v1-offline-owner-signer-registry-v1',
    purpose:'synthetic-root-signed-fleet-manifest-registry',
    registryAudience:REGISTRY_AUDIENCE,
    sourceProjectId:PROJECT_ID,sequence,...interval,
    signers:[{signerId:SIGNER_ID,keyVersion:1,
      publicKeySpkiBase64:spki(signer).toString('base64'),
      status:'active',...interval
    }],revokedSignerFingerprints:revoked
  },root);
  const plan=buildPlan(source);
  const keys=[
    ...plan.drivers.map(d=>'drivers/'+d.id),
    ...plan.vehicles.map(v=>'vehicles/'+v.id)
  ].sort();
  const manifest=signed({
    schema:'imile-v1-offline-fleet-manifest-v1',
    purpose:'synthetic-preseal-dry-run',signerId:SIGNER_ID,
    projectId:PROJECT_ID,sourceSha256:sha256(source),
    sourceRevision:1,canonicalPlanDigest:sha256(keys)
  },signer);
  return {
    root,signer,source,manifest,
    registry,signerFingerprint:fingerprint(signer),
    publicSpki:spki(root).toString('base64'),
    pin:fingerprint(root)
  };
}
const bounded=(promise,label)=>new Promise((resolve,reject)=>{
  const t=setTimeout(()=>reject(Error('IPC_TIMEOUT '+label)),timeout);
  promise.then(v=>{clearTimeout(t);resolve(v)},e=>{clearTimeout(t);reject(e)});
});
async function startWorker(f){
  const child=fork(workerFile,[],{
    env:{...process.env,FIRESTORE_EMULATOR_HOST:'127.0.0.1:8787',
      V1_DEMO_ROOT_SPKI:f.publicSpki,V1_DEMO_ROOT_SHA:f.pin},
    stdio:['ignore','pipe','pipe','ipc'],execArgv:[]
  });
  let dead=false,idx=0,stderr='';
  const outstanding=new Map();
  let readyResolve,readyReject;
  const ready=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject});
  child.stderr.on('data',d=>{stderr+=String(d).slice(0,15000)});
  child.on('message',m=>{
    if(m?.type==='ready')return readyResolve(m.pid);
    if(m?.type==='response'){
      const w=outstanding.get(m.reqId);
      if(w){outstanding.delete(m.reqId);w.resolve(m.answer)}
    }
  });
  child.on('error',e=>{
    readyReject(e);
    for(const v of outstanding.values())v.reject(e);
    outstanding.clear();
  });
  child.on('exit',(code,signal)=>{
    dead=true;
    const e=Error('WORKER_EXIT '+JSON.stringify({code,signal,
      stderr:stderr.slice(-4000)}));
    readyReject(e);
    for(const v of outstanding.values())v.reject(e);
    outstanding.clear();
  });
  const pid=await bounded(ready,'ready');
  const call=(command,extra={})=>bounded(new Promise((resolve,reject)=>{
    if(dead||!child.connected)return reject(Error('CHILD_UNAVAILABLE'));
    const reqId=++idx;outstanding.set(reqId,{resolve,reject});
    child.send({reqId,command,...extra},error=>{
      if(error){outstanding.delete(reqId);reject(error)}
    });
  }),command);
  const close=async()=>{
    if(dead)return;
    try{await call('exit')}catch{}
    if(!dead){try{child.disconnect()}catch{}child.kill('SIGTERM')}
  };
  return {pid,call,close};
}
function positive(r){
  assert.equal(r.ok,true,JSON.stringify(r));
  assert.notEqual(r.canSeal,true);
  assert.equal(r.sealed,false);
  assert.equal(r.authorizedForImport,false);
  assert.equal(r.productionIamVerified,false);
  assert.notEqual(r.externalTrustRootAuthenticityVerified,true);
}
function negative(r,pattern){
  assert.equal(r.ok,false,JSON.stringify(r));
  assert.equal(r.canSeal,false);
  assert.equal(r.sealed,false);
  assert.equal(r.authorizedForImport,false);
  if(pattern)assert.match(r.reason,pattern);
}
try{
  await test('root-signed registry + signer-signed full rich source + real fenced epoch/claims one Firestore transaction, 3 OS processes, revoked/reset attacks',async()=>{
    await env.clearFirestore();
    const f=fixture(),workers=[];
    try{
      const a=await startWorker(f);workers.push(a);
      const b=await startWorker(f);workers.push(b);
      assert.notEqual(a.pid,b.pid);
      assert.notEqual(a.pid,process.pid);
      const v1=f.registry(1,[]);
      const v2=f.registry(2,[f.signerFingerprint]);
      positive(await a.call('adopt',{bundle:v1}));
      const started=await a.call('begin');
      positive(started);
      assert.equal(started.totalExpected,3);
      const applied=await a.call('apply');
      positive(applied);
      assert.equal(applied.verifiedCount,3);
      const epoch=started.epoch;
      const payload={bundle:v1,manifest:f.manifest,epoch};
      const both=await Promise.all([
        b.call('bind',payload),
        a.call('bind',payload)
      ]);
      for(const receipt of both){
        positive(receipt);
        assert.equal(receipt.knownRichPairCount,3);
        assert.equal(receipt.readDocumentCount,9);
        assert.equal(receipt.registrySequence,1);
        assert.equal(receipt.fencedEpoch,epoch);
        assert.equal(receipt.atomicNamespaceSnapshotVerified,false);
      }
      assert.equal(both.filter(r=>r.receiptCreated).length,1,
        JSON.stringify(both));
      const c=await startWorker(f);workers.push(c);
      assert.notEqual(c.pid,a.pid);
      assert.notEqual(c.pid,b.pid);
      const restored=await c.call('bind',payload);
      positive(restored);
      assert.equal(restored.receiptCreated,false);
      console.log('PASS [E+3 OS processes]: 2 Ed25519 signed chain bound transactionally to root-signed highwater, original rich 3 master+3 claim, fenced epoch and receipt; restart confirmed');

      // Original Rules DENY normal signed-in client spoofing receipt.
      const client=env.authenticatedContext(uid,{
        email:'imilemanagement@imile-management-staging.firebaseapp.com'
      }).firestore();
      await assertFails(setDoc(doc(client,
        'v1SyntheticSignedSourceEpochBindings','current'),
        {authorizedForImport:true,sealed:true}));
      negative(await b.call('bind',{...payload,epoch:epoch+1}),
        /FENCED_SOURCE_EPOCH_OR_COMPLETE_JOURNAL_DENIED/);
      negative(await b.call('bind',{...payload,pinOverride:'f'.repeat(64)}),
        /TWO_ED25519_FULL_RICH_CHAIN_DENIED/);
      negative(await b.call('bind',{...payload,tamperSnapshot:true}),
        /TWO_ED25519_FULL_RICH_CHAIN_DENIED/);
      const forged=structuredClone(f.manifest);
      forged.payload.sourceSha256='f'.repeat(64);
      negative(await b.call('bind',{...payload,manifest:forged}),
        /TWO_ED25519_FULL_RICH_CHAIN_DENIED/);
      console.log('PASS DENY [E+3 OS processes]: forbidden browser receipt, stale epoch, wrong pin, forged nested source history/signature');

      const before=(await c.call('state')).state.highwater;
      positive(await b.call('adopt',{bundle:v2}));
      negative(await c.call('bind',payload),
        /ROOT_SIGNED_REGISTRY_NOT_CURRENT_OR_SIGNER_REVOKED/);
      const state=(await c.call('state')).state;
      assert.equal(state.highwater.sequence,2);
      assert.equal(state.receipt.registrySequence,1);
      negative(await c.call('seal'),/REAL_PRIVILEGED_SOURCE_IAM_AND_ATOMIC_SEAL_MISSING/);
      console.log('PASS DENY [E+3 OS processes]: newer root-signed revocation advances persisted highwater and old valid source signer fails binding');

      // Actual privileged bypass can reset highwater. This is NOT
      // production antirollback; expose the vulnerability, never seal.
      assert.equal((await b.call('resetHighwaterTestOnly',{
        registryOverride:before
      })).privilegedTestBypass,true);
      const oldAccepted=await c.call('bind',payload);
      positive(oldAccepted);
      assert.equal(oldAccepted.registrySequence,1);
      assert.equal(oldAccepted.canSeal,false);
      console.log('PASS VULNERABILITY [E+3 OS processes]: out-of-band privileged registry rollback allows old signer-signed source binding after revocation; production NO-GO');

      // Privileged modification of FULL-RICH claim must be caught even
      // with a previously successful signed receipt.
      assert.equal((await b.call('tamperClaimTestOnly',{
        claimPath:'flottaDriverClaims/DA0001'
      })).privilegedTestBypass,true);
      negative(await c.call('bind',payload),
        /SIGNED_FULL_RICH_MASTER_OR_CLAIM_TAMPERED/);
      negative(await c.call('seal'),/REAL_PRIVILEGED_SOURCE_IAM_AND_ATOMIC_SEAL_MISSING/);
      console.log('PASS DENY [E+3 OS processes]: tampered immutable claim prevents current signed-source epoch reattestation, no seal');
    }finally{
      for(const w of workers.reverse())await w.close();
    }
    console.log(JSON.stringify({
      verdict:'LOCAL_TWO_SIGNATURE_SOURCE_EPOCH_FENCING_ONLY',
      threeIndependentNodeOSProcesses:true,
      rootSignedRegistryAndSignerSignedSource:true,
      singleFirestoreTransactionIncludesHighwaterLockReceiptAndRichPairs:true,
      originalFullRestrictedRules:true,
      privilegedResetCanRevalidateRevokedSigner:true,
      forgedClaimDenied:true,
      fullRichBackupAndEpochVerified:true,
      externalOwnerTrustRootVerified:false,
      privilegedWriterIsolationVerified:false,
      productionIamVerified:false,
      atomicNamespaceSnapshotVerified:false,
      canSeal:false,sealed:false,fullV1:'NO_GO'
    }));
  });
}finally{await env.cleanup();}
