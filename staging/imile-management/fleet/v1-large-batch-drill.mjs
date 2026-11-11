/**
 * #185 + #155: genuinely large synthetic Firestore emulator import.
 *
 * Bounded multi-batch privileged TEST-ONLY local seeding, interruption,
 * forged checkpoints, partial/orphan/readback detection, rollback,
 * deterministic resume and final transaction checking every rich keyed doc.
 *
 * This is not a production importer/IAM implementation, and Firestore SDK
 * emulator behavior is not a measured production wire-size certificate.
 */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import {collection,doc,deleteDoc,getDoc,getDocs,runTransaction,setDoc,updateDoc,writeBatch,Timestamp}
  from 'firebase/firestore';
import {buildPlan,preflight,simulateBackup,restoreDrill,sha256}
  from '../../../tools/v1-migration-dryrun.mjs';
import {checkSizeGate} from '../../../tools/v1-firestore-size-gate.mjs';

const projectId='demo-imile-v1-scale';
const uid='synthetic-imile-v1-admin-0000001';
const email='imilemanagement@imile-management-staging.firebaseapp.com';
const SOURCE='flottaSharedState/current',APPROVAL='flottaMigrationApproval/current';
const CP='v1ScaleCheckpoints/current';
const BATCH_DOCS=48,COUNT=220;
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const one=()=>({
  drivers:Array.from({length:COUNT},(_,i)=>({
    id:'original-driver-'+i,daCode:'DA'+String(i).padStart(4,'0'),
    name:'Synthetic Driver '+i,kapacitas:50+i%30,status:'aktiv',
    history:[{event:'start',nested:{source:'synthetic',number:i}},
      {event:'route',notes:['first','második',i]}],
    rich:{agency:'test',address:'NO_REAL_ADDRESS',foo:[{keep:true}]}
  })),
  vehicles:Array.from({length:COUNT},(_,i)=>({
    id:'original-car-'+i,rendszam:'TEST'+String(i).padStart(4,'0'),
    status:'aktiv',gyartmany:'synthetic',
    history:[{event:'service',details:{driver:'not real',index:i}}],
    extra:{nested:{odometer:i*100,retain:['a','b','c']}}
  })),
  fuelCards:[{id:'f-1',history:[{e:'synthetic'}]}],
  contacts:[{id:'c-1',history:[{e:'synthetic'}]}],
  extraRoot:{nextSchema:'preserve',nested:{legal:true}}
});
const source=one(),pre=preflight(source);
assert.equal(pre.ok,true,'valid large source: '+JSON.stringify(pre.errors));
const plan=buildPlan(source,pre);
const backup=simulateBackup(source);
assert.equal(restoreDrill(backup,pre.sourceSha256).ok,true);
const expected=new Map();
for(const entry of plan.drivers)expected.set('flottaDrivers/'+entry.id,entry.data);
for(const entry of plan.vehicles)expected.set('flottaVehicles/'+entry.id,entry.data);
const paths=[...expected.keys()].sort();
assert.equal(paths.length,COUNT*2);
const gate=checkSizeGate(source,Object.fromEntries(expected));
assert.equal(gate.advisoryOk,true,'strict local advisory denied: '+gate.reason);
assert.equal(gate.authorizedForImport,false);
assert.equal(gate.firestoreEncodedSizeVerified,false);
function assertLocalOnly(){
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST,'127.0.0.1:8787');
  assert.ok(/^demo-/.test(projectId));
  if(process.env.GOOGLE_APPLICATION_CREDENTIALS||
     process.env.FIREBASE_SERVICE_ACCOUNT)
    throw Error('NO_CLOUD_IDENTITY_ENV_ALLOWED');
}
assertLocalOnly();
const rawRules=await readFile(new URL('../../../depokapacitas/firestore-v1-restricted.rules',import.meta.url),'utf8');
assert.match(rawRules,/REPLACE_WITH_REAL_SHARED_UID/);
const env=await initializeTestEnvironment({
  projectId,firestore:{host:'127.0.0.1',port:8787,
    rules:rawRules.replaceAll('REPLACE_WITH_REAL_SHARED_UID',uid)}
});
const cl=env.authenticatedContext(uid,{email}).firestore();
const srt=a=>[...a].sort();
let batches=0,checkpointChecks=0;
const pathRef=(db,path)=>doc(db,...path.split('/'));
const presentState=async db=>{
  const found=new Map();
  for(const c of ['flottaDrivers','flottaVehicles']){
    const all=await getDocs(collection(db,c));
    for(const row of all.docs)found.set(c+'/'+row.id,row.data());
  }
  const got=srt([...found.keys()]);
  const missing=paths.filter(x=>!found.has(x));
  const extra=got.filter(x=>!expected.has(x));
  const mismatched=got.filter(x=>expected.has(x)&&sha256(found.get(x))!==sha256(expected.get(x)));
  if(extra.length||mismatched.length)
    throw Error('KEYED_EXTRA_OR_TAMPER '+JSON.stringify({extra,mismatched}));
  return {found,got,missing};
};
const actualSource=async db=>{
  const r=await getDoc(pathRef(db,SOURCE));
  if(!r.exists())throw Error('ORIGINAL_SOURCE_MISSING');
  const data=r.data();
  if(data.migrationSourceSha256!==pre.sourceSha256||data.revision!==1)
    throw Error('SOURCE_SHA_OR_REVISION_DRIFT');
  const actual=Object.fromEntries(Object.keys(source).map(k=>[k,data[k]]));
  if(sha256(actual)!==pre.sourceSha256)throw Error('SOURCE_FULL_RICH_DIGEST_DRIFT');
  if(srt(Object.keys(data)).join('|')!==srt([...Object.keys(source),
    'sealed','revision','migrationSourceSha256']).join('|'))
    throw Error('SOURCE_EXTRA_FIELDS');
  return data;
};
const inspect=async db=>{
  const state=await presentState(db),original=await actualSource(db);
  if(original.sealed)throw Error('SEALED_CHECKPOINT_IMMUTABLE');
  const cp=await getDoc(pathRef(db,CP));
  if(cp.exists()){
    const c=cp.data();
    if(c.phase!=='importing'||c.sha!==pre.sourceSha256||c.sourceRevision!==1||
       c.nextBatch!==Math.ceil(state.got.length/BATCH_DOCS)||
       JSON.stringify(srt(c.completed||[]))!==JSON.stringify(state.got)||
       c.completedDigest!==sha256(state.got))
      throw Error('FORGED_OR_STALE_BATCH_CHECKPOINT');
  }else if(state.got.length)throw Error('MISSING_BATCH_CHECKPOINT');
  checkpointChecks++;
  return {...state,cp};
};
async function importBatches(db,maxBatches=Infinity){
  let n=0;
  while(n<maxBatches){
    const state=await inspect(db);
    if(!state.missing.length)return state;
    const next=state.missing.slice(0,BATCH_DOCS);
    const resulting=srt([...state.got,...next]);
    const b=writeBatch(db);
    for(const path of next)b.set(pathRef(db,path),expected.get(path));
    b.set(pathRef(db,CP),{
      phase:'importing',sha:pre.sourceSha256,sourceRevision:1,
      nextBatch:Math.ceil(resulting.length/BATCH_DOCS),
      completed:resulting,completedDigest:sha256(resulting)
    });
    await b.commit();n++;batches++;
  }
  return inspect(db);
}
async function rollback(db){
  const original=await actualSource(db);
  if(original.sealed)throw Error('POSTSEAL_ROLLBACK_BLOCKED');
  const state=await inspect(db);
  const b=writeBatch(db);
  for(const path of state.got)b.delete(pathRef(db,path));
  if(state.cp.exists())b.delete(pathRef(db,CP));
  await b.commit();
  const back=await presentState(db);
  assert.equal(back.got.length,0,'no orphaned doc after preseal rollback');
  return back;
}
async function seal(db){
  const state=await inspect(db);
  if(state.missing.length)throw Error('DENY_PARTIAL_MIGRATION_SEAL');
  if((await getDoc(pathRef(db,APPROVAL))).exists())throw Error('APPROVAL_EXISTS');
  // Transaction READS all expected keyed masters and source/checkpoint
  // BEFORE any write; full-rich SHA/ID parity checked at final read.
  // Querying extras was done just before this transaction. A separately
  // controlled privileged IAM role must guarantee no concurrent writer:
  // this emulator cannot prove that production trust/absence-of-races.
  return runTransaction(db,async tx=>{
    const sr=pathRef(db,SOURCE),cp=pathRef(db,CP),ap=pathRef(db,APPROVAL);
    const [src,c,approval,...docs]=await Promise.all([
      tx.get(sr),tx.get(cp),tx.get(ap),
      ...paths.map(p=>tx.get(pathRef(db,p)))
    ]);
    if(!src.exists()||!c.exists()||approval.exists()||src.data().sealed||
       src.data().migrationSourceSha256!==pre.sourceSha256||
       c.data().sha!==pre.sourceSha256||
       c.data().completedDigest!==sha256(paths)||
       JSON.stringify(c.data().completed)!==JSON.stringify(paths))
      throw Error('DENY_SEAL_SOURCE_OR_CHECKPOINT');
    const fullBody=Object.fromEntries(Object.keys(source).map(k=>[k,src.data()[k]]));
    if(sha256(fullBody)!==pre.sourceSha256)
      throw Error('DENY_SEAL_SOURCE_HASH_DRIFT');
    for(let i=0;i<paths.length;i++){
      if(!docs[i].exists()||sha256(docs[i].data())!==sha256(expected.get(paths[i])))
        throw Error('DENY_SEAL_KEYED_RICH_PARITY '+paths[i]);
    }
    tx.set(ap,{status:'approved',approvedUid:uid,sourceSha256:pre.sourceSha256,
      approvedAt:Timestamp.fromDate(new Date('2026-01-01T00:00:00Z'))});
    tx.update(sr,{sealed:true});
    tx.update(cp,{phase:'sealed'});
    return true;
  },{maxAttempts:1});
}
async function nearLimitProbe(db){
  // True local SDK/Firestore emulator PUT result, NOT a reliable
  // measurement of the production wire encoding or document storage size.
  const small='é'.repeat(440000),large='é'.repeat(540000);
  const smallBytes=Buffer.byteLength(small,'utf8');
  const largeBytes=Buffer.byteLength(large,'utf8');
  const target=doc(db,'v1ScaleSynthetic','sizeProbe');
  await setDoc(target,{message:small,kind:'synthetic-utf8'});
  const readback=await getDoc(target);
  assert.equal(readback.data().message.length,440000);
  let oversizeRejected=false,rejectReason='';
  try{
    await setDoc(target,{message:large,kind:'synthetic-utf8'});
  }catch(e){
    oversizeRejected=true;rejectReason=e.code||String(e.message||e);
  }
  if(!oversizeRejected)
    throw Error('EMULATOR_ACCEPTED_OVER_1MIB_FIELD_NOT_RELEASE_SAFE');
  await deleteDoc(target);
  console.log('PASS [E+SDK] local UTF8 near-limit=',smallBytes,
    'oversize=',largeBytes,'rejected=',rejectReason,
    ' (NOT production encoded wire-size authorization)');
}
async function main(){
  try{
    // Poisoned sources are refused by preflight/buildPlan without ANY
    // privileged writes or runtime Rules bypass.
    const dupDA=one();dupDA.drivers[1].daCode=dupDA.drivers[0].daCode.toLowerCase();
    const dupPlate=one();dupPlate.vehicles[1].rendszam='test 0000';
    assert.equal(preflight(dupDA).ok,false);
    assert.equal(preflight(dupPlate).ok,false);
    assert.throws(()=>buildPlan(dupDA),/Duplicate DA/);
    assert.throws(()=>buildPlan(dupPlate),/Duplicate plate/);
    console.log('PASS local preflight denies privileged-poisoned normalized identities');
    await env.withSecurityRulesDisabled(async ctx=>{
      const db=ctx.firestore();
      await setDoc(doc(db,'users',uid),{role:'admin',active:true});
      await setDoc(pathRef(db,SOURCE),{
        ...source,revision:1,sealed:false,migrationSourceSha256:pre.sourceSha256
      });
      await nearLimitProbe(db);
      const first=await importBatches(db,2);
      assert.equal(first.got.length,BATCH_DOCS*2);
      assert.equal((await actualSource(db)).sealed,false);
      await assert.rejects(()=>seal(db),/DENY_PARTIAL_MIGRATION_SEAL/);
      console.log('PASS interruption after batch 2 leaves source UNSEALED');
      const cp=pathRef(db,CP);
      await updateDoc(cp,{completedDigest:'f'.repeat(64)});
      await assert.rejects(()=>importBatches(db,1),/FORGED_OR_STALE_BATCH_CHECKPOINT/);
      await updateDoc(cp,{completedDigest:sha256(first.got)});
      const touched=pathRef(db,first.got[0]);
      await updateDoc(touched,{history:[]});
      await assert.rejects(()=>seal(db),/KEYED_EXTRA_OR_TAMPER/);
      await setDoc(touched,expected.get(first.got[0]));
      const rogue=doc(db,'flottaDrivers','ROGUE999');
      await setDoc(rogue,{daCode:'ROGUE999',sourceIndex:0});
      await assert.rejects(()=>importBatches(db,1),/KEYED_EXTRA_OR_TAMPER/);
      await deleteDoc(rogue);
      await rollback(db);
      assert.equal((await actualSource(db)).sealed,false);
      console.log('PASS checkpoint poison, rich tamper, orphan and rollback refusal/recovery');
      await importBatches(db,2);
      const completed=await importBatches(db);
      assert.equal(completed.got.length,COUNT*2);
      assert.equal(completed.missing.length,0);
      // The source can drift only through privileged test bypass; must
      // be noticed and block final approval.
      await updateDoc(pathRef(db,SOURCE),{contacts:[]});
      await assert.rejects(()=>seal(db),/SOURCE_FULL_RICH_DIGEST_DRIFT/);
      await updateDoc(pathRef(db,SOURCE),{contacts:source.contacts});
      await seal(db);
      assert.equal((await getDoc(pathRef(db,SOURCE))).data().sealed,true);
      assert.equal((await getDoc(pathRef(db,APPROVAL))).data().sourceSha256,pre.sourceSha256);
      await assert.rejects(()=>rollback(db),/POSTSEAL_ROLLBACK_BLOCKED/);
      console.log('PASS [E] final transaction readbacks all',COUNT*2,'rich keyed docs');
    });
    await assertSucceeds(updateDoc(doc(cl,'flottaDrivers','DA0000'),{
      kapacitas:66,revision:2
    }));
    await assertFails(updateDoc(doc(cl,'flottaDrivers','DA0000'),{
      sourceIndex:1,revision:3
    }));
    await assertFails(setDoc(doc(cl,'flottaVehicles','EVIL123'),{
      rendszam:'EVIL123',sourceIndex:221,status:'aktiv'
    }));
    await assertFails(updateDoc(doc(cl,SOURCE),{sealed:false,revision:2}));
    console.log('PASS [E+SDK] valid postseal edit + hostile provenance/seal DENY');
    console.log(JSON.stringify({
      result:'PASS_SYNTHETIC_ONLY',drivers:COUNT,vehicles:COUNT,
      records:COUNT*2,batchDocumentLimit:BATCH_DOCS,batches,
      checkpointChecks,sourceJsonBytes:gate.sourceJsonBytes,
      originalStorageEstimateBytes:gate.sourceStorageEstimateBytes,
      firestoreEncodedSizeVerified:false,authorizedForImport:false,
      productionPrivilegedImporterVerified:false
    }));
  }finally{
    await env.cleanup();
  }
}
main().catch(e=>{console.error('V1 FULL-SCALE DRILL NO-GO:',e);process.exitCode=1;});
