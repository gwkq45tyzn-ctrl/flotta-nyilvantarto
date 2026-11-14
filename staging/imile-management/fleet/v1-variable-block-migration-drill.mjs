/**
 * #185 local Firestore emulator drill for unequal four-block sources.
 * Synthetic data only. Restarts are new objects that read persisted
 * checkpoints. Source readback is not a production closing approval.
 */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import {collection,doc,deleteDoc,getDoc,getDocs,setDoc,updateDoc,writeBatch}
  from 'firebase/firestore';
import {sha256} from '../../../tools/v1-migration-dryrun.mjs';
import {
  PAIR_CHUNK,MAX_BATCH_WRITES,syntheticFourBlockSource,projectBlockPairs,
  chunkPairs,assessChunkReadback,localCloseDecision,refuseUnseal
} from '../../../tools/v1-variable-block-migration.mjs';

const projectId='demo-imile-v1-variable-blocks';
const uid='synthetic-imile-v1-admin-0000001';
const email='imilemanagement@imile-management-staging.firebaseapp.com';
const SMALL={drivers:12,vehicles:14,fuelCards:14,contacts:5};
const LARGE={drivers:200,vehicles:90,fuelCards:22,contacts:7};
const BLOCKS=['drivers','vehicles','fuelCards','contacts'];
const JOURNAL='v1SyntheticVariableBlockJournal/current';
const RECEIPTS='v1SyntheticVariableBlockChunks';
const SOURCE='flottaSharedState/current';
const APPROVAL='flottaMigrationApproval/current';
const KEYED=['flottaDrivers','flottaVehicles','flottaDriverClaims','flottaVehicleClaims'];

function assertLocalOnly(){
  if(!['127.0.0.1:8787','localhost:8787'].includes(process.env.FIRESTORE_EMULATOR_HOST))
    throw Error('LOCAL_FIRESTORE_EMULATOR_ONLY');
  if(process.env.GOOGLE_APPLICATION_CREDENTIALS||process.env.FIREBASE_SERVICE_ACCOUNT)
    throw Error('NO_CLOUD_IDENTITY_ENV_ALLOWED');
  if(!projectId.startsWith('demo-'))throw Error('DEMO_PROJECT_REQUIRED');
}

class VariableBlockSession{
  constructor(db,source){
    this.db=db;
    this.source=source;
    this.prepared=projectBlockPairs(source);
    this.chunks=chunkPairs(this.prepared.pairs,PAIR_CHUNK);
    this.journalRef=doc(db,...JOURNAL.split('/'));
    this.sourceRef=doc(db,...SOURCE.split('/'));
    this.approvalRef=doc(db,...APPROVAL.split('/'));
  }
  async loadKeyed(){
    const out={};
    for(const name of KEYED){
      const snap=await getDocs(collection(this.db,name));
      out[name]=new Map(snap.docs.map(row=>[row.id,row.data()]));
    }
    return out;
  }
  async verifyCommitted(){
    const journalSnap=await getDoc(this.journalRef);
    const receiptSnap=await getDocs(collection(this.db,RECEIPTS));
    if(!journalSnap.exists()){
      if(!receiptSnap.empty)throw Error('FORGED_OR_STALE_CHECKPOINT');
      return {committed:0,journal:null,closed:false};
    }
    const journal=journalSnap.data();
    if(journal.sourceSha256!==this.prepared.sourceSha256)
      throw Error('SOURCE_SHA_DRIFT');
    if(journal.sealed!==false||journal.authorizedForImport!==false||
       journal.productionClosingTrust!==false||
       journal.firestoreEncodedSizeVerified!==false)
      throw Error('CLOSING_TRUST_MIXED_INTO_SOURCE');
    const sourceSnap=await getDoc(this.sourceRef);
    if(!sourceSnap.exists())throw Error('ORIGINAL_SOURCE_MISSING');
    const sourceData=sourceSnap.data();
    if(sourceData.sealed!==false||sourceData.revision!==1||
       sourceData.migrationSourceSha256!==this.prepared.sourceSha256)
      throw Error('SOURCE_SHA_OR_SEAL_DRIFT');
    for(const key of BLOCKS){
      if(sha256(sourceData[key])!==sha256(this.source[key]))
        throw Error('SOURCE_BLOCK_DRIFT');
    }
    if(!Number.isSafeInteger(journal.committedChunks)||
       journal.committedChunks<0||journal.committedChunks>this.chunks.length)
      throw Error('FORGED_OR_STALE_CHECKPOINT');
    const receipts=new Map(receiptSnap.docs.map(row=>[row.id,row.data()]));
    if(receipts.size!==journal.committedChunks)
      throw Error('FORGED_OR_STALE_CHECKPOINT');
    const keyed=await this.loadKeyed();
    const expected={
      flottaDrivers:new Set(),flottaVehicles:new Set(),
      flottaDriverClaims:new Set(),flottaVehicleClaims:new Set()
    };
    for(let i=0;i<journal.committedChunks;i++){
      const chunk=this.chunks[i];
      const receipt=receipts.get(String(i).padStart(4,'0'));
      const pairIds=chunk.map(pair=>pair.kind+'/'+pair.id);
      const pairDigest=sha256(chunk.map(pair=>({
        id:pair.id,master:pair.master,claim:pair.claim
      })));
      if(!receipt||JSON.stringify(receipt.pairIds)!==JSON.stringify(pairIds)||
         receipt.pairDigest!==pairDigest||
         receipt.sourceSha256!==this.prepared.sourceSha256)
        throw Error('FORGED_OR_STALE_CHECKPOINT');
      const masters={},claims={};
      for(const pair of chunk){
        const masterCol=pair.masterPath.split('/')[0];
        const claimCol=pair.claimPath.split('/')[0];
        if(keyed[masterCol].has(pair.id))masters[pair.id]=keyed[masterCol].get(pair.id);
        if(keyed[claimCol].has(pair.id))claims[pair.id]=keyed[claimCol].get(pair.id);
        expected[masterCol].add(pair.id);
        expected[claimCol].add(pair.id);
      }
      const assessed=assessChunkReadback({
        chunk,masters,claims,sourceSha256:this.prepared.sourceSha256
      });
      if(!assessed.ok)throw Error(assessed.reason);
    }
    for(const [name,ids] of Object.entries(expected)){
      for(const id of keyed[name].keys()){
        if(!ids.has(id))
          throw Error(name.includes('Claims')?'ORPHAN_CLAIM':'ORPHAN_MASTER');
      }
    }
    return {committed:journal.committedChunks,journal,closed:journal.closed===true};
  }
  journalBody(committedChunks,extra={}){
    return {
      sourceSha256:this.prepared.sourceSha256,
      counts:this.prepared.counts,
      committedChunks,
      closed:false,
      sourceTrust:'pending',
      closingTrust:'open',
      sealed:false,
      authorizedForImport:false,
      productionClosingTrust:false,
      firestoreEncodedSizeVerified:false,
      ...extra
    };
  }
  chunkDeleteRefs(index){
    const refs=[];
    for(const pair of this.chunks[index]){
      refs.push(doc(this.db,...pair.masterPath.split('/')));
      refs.push(doc(this.db,...pair.claimPath.split('/')));
    }
    refs.push(doc(this.db,RECEIPTS,String(index).padStart(4,'0')));
    return refs;
  }
  async verifyRollbackRemainder(fence){
    const sourceSnap=await getDoc(this.sourceRef);
    if(!sourceSnap.exists())throw Error('ORIGINAL_SOURCE_MISSING');
    const sourceData=sourceSnap.data();
    if(sourceData.sealed!==false||sourceData.revision!==1||
       sourceData.migrationSourceSha256!==this.prepared.sourceSha256)
      throw Error('SOURCE_SHA_OR_SEAL_DRIFT');
    for(let i=0;i<fence.deletedThrough;i++){
      for(const ref of this.chunkDeleteRefs(i)){
        if((await getDoc(ref)).exists())throw Error('ROLLBACK_CURSOR_AHEAD_OF_DELETES');
      }
    }
    for(let i=fence.deletedThrough;i<fence.total;i++){
      const chunk=this.chunks[i];
      const receipt=await getDoc(doc(this.db,RECEIPTS,String(i).padStart(4,'0')));
      const pairIds=chunk.map(pair=>pair.kind+'/'+pair.id);
      const pairDigest=sha256(chunk.map(pair=>({
        id:pair.id,master:pair.master,claim:pair.claim
      })));
      if(!receipt.exists()||JSON.stringify(receipt.data().pairIds)!==JSON.stringify(pairIds)||
         receipt.data().pairDigest!==pairDigest||
         receipt.data().sourceSha256!==this.prepared.sourceSha256)
        throw Error('ROLLBACK_REMAINDER_MISMATCH');
      const masters={},claims={};
      for(const pair of chunk){
        const master=await getDoc(doc(this.db,...pair.masterPath.split('/')));
        const claim=await getDoc(doc(this.db,...pair.claimPath.split('/')));
        if(master.exists())masters[pair.id]=master.data();
        if(claim.exists())claims[pair.id]=claim.data();
      }
      const assessed=assessChunkReadback({
        chunk,masters,claims,sourceSha256:this.prepared.sourceSha256
      });
      if(!assessed.ok)throw Error(assessed.reason);
    }
  }
  async importNext(){
    const fenceSnap=await getDoc(this.journalRef);
    if(fenceSnap.exists()&&fenceSnap.data().rollbackFence)
      throw Error('ROLLBACK_FENCE_HELD');
    const state=await this.verifyCommitted();
    if(state.closed)throw Error('CLOSED_REPLAY_DENIED');
    if(state.committed>=this.chunks.length)
      return {done:true,committed:state.committed,writes:0};
    const chunk=this.chunks[state.committed];
    const batch=writeBatch(this.db);
    if(!state.journal){
      batch.set(this.sourceRef,{
        ...this.source,revision:1,sealed:false,
        migrationSourceSha256:this.prepared.sourceSha256
      });
    }
    for(const pair of chunk){
      batch.set(doc(this.db,...pair.masterPath.split('/')),pair.master);
      batch.set(doc(this.db,...pair.claimPath.split('/')),pair.claim);
    }
    batch.set(doc(this.db,RECEIPTS,String(state.committed).padStart(4,'0')),{
      chunkIndex:state.committed,
      sourceSha256:this.prepared.sourceSha256,
      pairIds:chunk.map(pair=>pair.kind+'/'+pair.id),
      pairDigest:sha256(chunk.map(pair=>({
        id:pair.id,master:pair.master,claim:pair.claim
      })))
    });
    batch.set(this.journalRef,this.journalBody(state.committed+1));
    await batch.commit();
    return {done:false,committed:state.committed+1,writes:chunk.length*2+1};
  }
  async importAll(){
    let step=await this.importNext();
    while(!step.done)step=await this.importNext();
    return step;
  }
  async rollback(options={}){
    const maxWrites=options.maxWrites??MAX_BATCH_WRITES;
    const crashAfter=options.crashAfterBatches??0;
    if(!Number.isSafeInteger(maxWrites)||maxWrites<1||
       !Number.isSafeInteger(crashAfter)||crashAfter<0)
      throw Error('INVALID_ROLLBACK_BATCH');
    const journalSnap=await getDoc(this.journalRef);
    const journal=journalSnap.exists()?journalSnap.data():null;
    if(journal?.closed===true)throw Error('POST_CLOSE_ROLLBACK_DENIED');
    let deletedThrough=0,total=0;
    if(journal?.rollbackFence){
      const fence=journal.rollbackFence;
      if(fence.sourceSha256!==this.prepared.sourceSha256||
         !Number.isSafeInteger(fence.deletedThrough)||
         !Number.isSafeInteger(fence.total)||
         fence.deletedThrough<0||fence.deletedThrough>fence.total||
         fence.total>this.chunks.length)
        throw Error('ROLLBACK_FENCE_MISMATCH');
      await this.verifyRollbackRemainder(fence);
      deletedThrough=fence.deletedThrough;
      total=fence.total;
    }else{
      const state=await this.verifyCommitted();
      if(!state.journal)return {rollbackBatches:0};
      total=state.committed;
    }
    let rollbackBatches=0;
    while(deletedThrough<total){
      const refs=[];
      let next=deletedThrough;
      while(next<total){
        const part=this.chunkDeleteRefs(next);
        if(part.length>maxWrites)throw Error('ROLLBACK_CHUNK_EXCEEDS_BATCH');
        if(refs.length&&refs.length+part.length>maxWrites)break;
        refs.push(...part);
        next++;
      }
      const finished=next===total;
      const batch=writeBatch(this.db);
      for(const ref of refs)batch.delete(ref);
      if(finished)batch.set(this.journalRef,this.journalBody(0));
      else batch.update(this.journalRef,{rollbackFence:{
        sourceSha256:this.prepared.sourceSha256,
        deletedThrough:next,
        total
      }});
      await batch.commit();
      rollbackBatches++;
      deletedThrough=next;
      if(!finished&&crashAfter&&rollbackBatches>=crashAfter)
        throw Error('ROLLBACK_INTERRUPTED');
    }
    for(let i=0;i<total;i++){
      for(const ref of this.chunkDeleteRefs(i))
        assert.equal((await getDoc(ref)).exists(),false,ref.path);
    }
    const sourceSnap=await getDoc(this.sourceRef);
    if(sourceSnap.exists())assert.equal(sourceSnap.data().sealed,false);
    return {rollbackBatches};
  }
  async close(){
    const state=await this.verifyCommitted();
    const approval=await getDoc(this.approvalRef);
    const decision=localCloseDecision({
      sourceParity:state.committed===this.chunks.length,
      approvalDocumentExists:approval.exists(),
      alreadyClosed:state.closed
    });
    if(!decision.ok)throw Error(decision.reason);
    await updateDoc(this.journalRef,{
      closed:true,
      sourceTrust:decision.sourceTrust,
      closingTrust:decision.closingTrust,
      sealed:false,
      authorizedForImport:false,
      productionClosingTrust:false,
      firestoreEncodedSizeVerified:false
    });
    assert.equal((await getDoc(this.sourceRef)).data().sealed,false);
    assert.equal((await getDoc(this.approvalRef)).exists(),false);
    return decision;
  }
  async unseal(){
    const snap=await getDoc(this.journalRef);
    throw Error(refuseUnseal(snap.exists()?snap.data():null).reason);
  }
}

async function denied(label,request){
  try{await request();throw Error('UNSAFE_ALLOW: '+label);}
  catch(error){
    if(String(error.message||error).startsWith('UNSAFE_ALLOW:'))throw error;
    assert.equal(error.code,'permission-denied',label);
  }
}

async function seedUser(env){
  await env.withSecurityRulesDisabled(async ctx=>{
    await setDoc(doc(ctx.firestore(),'users',uid),{
      active:true,role:'admin',name:'SYNTHETIC QA ADMIN'
    });
  });
}

async function readback(client,source,prepared){
  const live=await getDoc(doc(client,...SOURCE.split('/')));
  assert.equal(live.exists(),true);
  const data=live.data();
  for(const key of BLOCKS)assert.deepEqual(data[key],source[key],key);
  assert.equal(data.migrationSourceSha256,prepared.sourceSha256);
  assert.equal(data.sealed,false);
  assert.equal(prepared.pairs.length,prepared.counts.drivers+prepared.counts.vehicles);
  for(const pair of prepared.pairs){
    const master=await getDoc(doc(client,...pair.masterPath.split('/')));
    const claim=await getDoc(doc(client,...pair.claimPath.split('/')));
    assert.equal(master.exists(),true,pair.masterPath);
    assert.equal(claim.exists(),true,pair.claimPath);
    assert.deepEqual(master.data(),pair.master,pair.masterPath);
    assert.deepEqual(claim.data(),pair.claim,pair.claimPath);
    assert.equal(master.data().history[0].text.includes('árvíztűrő'),true);
  }
  assert.equal((await getDoc(doc(client,...APPROVAL.split('/')))).exists(),false);
}

async function main(){
  assertLocalOnly();
  const rawRules=await readFile(new URL(
    '../../../depokapacitas/firestore-v1-restricted.rules',import.meta.url),'utf8');
  assert.match(rawRules,/REPLACE_WITH_REAL_SHARED_UID/);
  const env=await initializeTestEnvironment({
    projectId,
    firestore:{
      host:'127.0.0.1',port:8787,
      rules:rawRules.replaceAll('REPLACE_WITH_REAL_SHARED_UID',uid)
    }
  });
  const summary={shapes:[]};
  try{
    const smallSource=syntheticFourBlockSource(SMALL);
    const smallPrepared=projectBlockPairs(smallSource);
    assert.equal(smallPrepared.pairs.length,26);
    assert.equal(smallPrepared.firestoreEncodedSizeVerified,false);

    await seedUser(env);
    const client=env.authenticatedContext(uid,{email}).firestore();
    await env.withSecurityRulesDisabled(async ctx=>{
    const db=ctx.firestore();
    let session=new VariableBlockSession(db,smallSource);
    let step=await session.importNext();
    assert.equal(step.committed,1);
    session=new VariableBlockSession(db,smallSource);
    assert.equal((await session.verifyCommitted()).committed,1);
    step=await session.importNext();
    assert.equal(step.committed,2);
    session=new VariableBlockSession(db,smallSource);
    assert.equal((await session.verifyCommitted()).committed,2);
    step=await session.importNext();
    assert.equal(step.committed,3);
    session=new VariableBlockSession(db,smallSource);
    step=await session.importAll();
    assert.equal(step.done,true);
    assert.equal(step.committed,chunkPairs(smallPrepared.pairs).length);
    await readback(client,smallSource,smallPrepared);
    console.log('PASS [E+SDK]: 12/14/14/5 interrupted resume and signed-in readback of 26 masters and 26 claims');

    const tampered=new VariableBlockSession(db,smallSource);
    const first=tampered.prepared.pairs[0];
    await updateDoc(doc(tampered.db,...first.masterPath.split('/')),{history:[]});
    await assert.rejects(()=>tampered.verifyCommitted(),/RICH_MASTER_MISMATCH/);
    await setDoc(doc(tampered.db,...first.masterPath.split('/')),first.master);
    console.log('PASS DENY [E+SDK]: tampered nested history blocks resume');

    await setDoc(doc(tampered.db,'flottaDriverClaims','ROGUECLAIM'),{
      sourceIndex:0,revision:1,migrationSourceSha256:smallPrepared.sourceSha256,
      masterSha256:'ab'.repeat(32)
    });
    await assert.rejects(()=>tampered.verifyCommitted(),/ORPHAN_CLAIM/);
    await deleteDoc(doc(tampered.db,'flottaDriverClaims','ROGUECLAIM'));
    console.log('PASS DENY [E+SDK]: orphan claim blocks resume');

    await updateDoc(tampered.journalRef,{committedChunks:9});
    await assert.rejects(()=>tampered.verifyCommitted(),/FORGED_OR_STALE_CHECKPOINT/);
    await updateDoc(tampered.journalRef,{committedChunks:step.committed});
    console.log('PASS DENY [E+SDK]: forged checkpoint chunk count blocks resume');

    const duplicate=tampered.prepared.pairs.filter(pair=>pair.kind==='drivers');
    await updateDoc(doc(tampered.db,...duplicate[1].claimPath.split('/')),{
      sourceIndex:duplicate[0].sourceIndex
    });
    await assert.rejects(()=>tampered.verifyCommitted(),/CLAIM_MISMATCH|DUPLICATE_SOURCE_INDEX/);
    await setDoc(doc(tampered.db,...duplicate[1].claimPath.split('/')),duplicate[1].claim);
    console.log('PASS DENY [E+SDK]: rewritten claim sourceIndex blocks resume');

    const rolled=await tampered.rollback();
    assert.ok(rolled.rollbackBatches>=1);
    const retry=new VariableBlockSession(db,smallSource);
    await retry.importAll();
    await readback(client,smallSource,smallPrepared);
    const closed=await retry.close();
    assert.equal(closed.sourceTrust,'readback-verified');
    assert.equal(closed.closingTrust,'locally-closed-not-production');
    await assert.rejects(()=>retry.importNext(),/CLOSED_REPLAY_DENIED/);
    await assert.rejects(()=>retry.rollback(),/POST_CLOSE_ROLLBACK_DENIED/);
    await assert.rejects(()=>retry.unseal(),/POST_CLOSE_UNSEAL_DENIED/);
    assert.equal((await getDoc(doc(client,...SOURCE.split('/')))).data().sealed,false);
    await denied('client cannot create migration approval',()=>setDoc(
      doc(client,...APPROVAL.split('/')),{status:'approved',sourceSha256:smallPrepared.sourceSha256}));
    await denied('client cannot seal the source archive',()=>updateDoc(
      doc(client,...SOURCE.split('/')),{sealed:true,revision:2}));
    console.log('PASS [E+SDK]: rollback/retry then local close refuses replay, rollback and unseal; approval document absent');

    await env.clearFirestore();
    await seedUser(env);
    const largeSource=syntheticFourBlockSource(LARGE);
    const largePrepared=projectBlockPairs(largeSource);
    assert.notEqual(largePrepared.counts.drivers,largePrepared.counts.vehicles);
    assert.ok(largePrepared.pairs.length>smallPrepared.pairs.length);
    let large=new VariableBlockSession(db,largeSource);
    await large.importNext();
    await large.importNext();
    large=new VariableBlockSession(db,largeSource);
    assert.equal((await large.verifyCommitted()).committed,2);
    await large.importAll();
    const largeRollback=await large.rollback();
    assert.ok(largeRollback.rollbackBatches>=2,
      'rollback batches='+largeRollback.rollbackBatches);
    large=new VariableBlockSession(db,largeSource);
    await large.importAll();
    const early=large.prepared.pairs[0];
    const late=large.prepared.pairs.at(-1);
    await assert.rejects(()=>large.rollback({crashAfterBatches:1}),/ROLLBACK_INTERRUPTED/);
    assert.equal((await getDoc(doc(db,...early.masterPath.split('/')))).exists(),false);
    assert.equal((await getDoc(doc(db,...late.masterPath.split('/')))).exists(),true);
    const foreign=doc(db,'flottaDrivers','FOREIGN-KEEP');
    await setDoc(foreign,{owner:'other-import',sourceIndex:0});
    const parked=new VariableBlockSession(db,largeSource);
    await assert.rejects(()=>parked.importNext(),/ROLLBACK_FENCE_HELD/);
    const stranger=new VariableBlockSession(db,syntheticFourBlockSource({
      drivers:3,vehicles:2,fuelCards:1,contacts:1
    }));
    await assert.rejects(()=>stranger.rollback(),/ROLLBACK_FENCE_MISMATCH/);
    assert.equal((await getDoc(foreign)).exists(),true);
    assert.equal((await getDoc(doc(db,...late.masterPath.split('/')))).exists(),true);
    const resumed=new VariableBlockSession(db,largeSource);
    const rest=await resumed.rollback();
    assert.ok(rest.rollbackBatches>=1);
    assert.equal((await getDoc(doc(db,...late.masterPath.split('/')))).exists(),false);
    assert.equal((await getDoc(foreign)).exists(),true);
    await deleteDoc(foreign);
    console.log('PASS [E+SDK]: rollback crash resumes from the fence; importNext and a foreign source are denied; FOREIGN-KEEP remains');
    large=new VariableBlockSession(db,largeSource);
    await large.importAll();
    await large.close();
    assert.equal((await getDoc(doc(large.db,...APPROVAL.split('/')))).exists(),false);
    assert.equal((await getDoc(doc(large.db,...SOURCE.split('/')))).data().sealed,false);
    console.log('PASS [E+SDK]: larger unequal source interrupted, rolled back in',
      largeRollback.rollbackBatches,'batches, retried, locally closed without approval');

    const probe=doc(db,'v1SyntheticVariableBlockProbe','size');
    const accepted='é'.repeat(1000);
    await setDoc(probe,{message:accepted,history:[{text:'árvíztűrő'}]});
    assert.equal((await getDoc(probe)).data().message,accepted);
    let rejected=false,rejectCode='';
    try{
      await setDoc(probe,{message:'é'.repeat(600000)});
    }catch(error){
      rejected=true;
      rejectCode=error.code||'';
    }
    if(!rejected)throw Error('EMULATOR_ACCEPTED_OVERSIZE_FIELD');
    await deleteDoc(probe);
    console.log('PASS [E+SDK] multibyte readback and oversize reject',rejectCode,
      '(emulator acceptance is not encoded-size proof)');

    summary.shapes.push({
      counts:SMALL,
      driverMasters:smallPrepared.counts.drivers,
      vehicleMasters:smallPrepared.counts.vehicles,
      masterAndClaimPairs:smallPrepared.pairs.length,
      sourceSha256:smallPrepared.sourceSha256,
      firestoreEncodedSizeVerified:false,
      authorizedForImport:false,
      sourceTrust:closed.sourceTrust,
      closingTrust:closed.closingTrust
    });
    summary.shapes.push({
      counts:LARGE,
      keyedPairs:largePrepared.pairs.length,
      rollbackBatches:largeRollback.rollbackBatches,
      sourceSha256:largePrepared.sourceSha256,
      firestoreEncodedSizeVerified:false,
      productionClosingTrust:false
    });
    summary.result='PASS_SYNTHETIC_EMULATOR_ONLY';
    summary.productionRecordCountHardcoded=false;
    summary.firestoreEncodedSizeVerified=false;
    summary.authorizedForImport=false;
    summary.productionApprovalWritten=false;
    console.log(JSON.stringify(summary));
    });
  }finally{
    await env.cleanup();
  }
}
main().catch(error=>{
  console.error('V1 VARIABLE BLOCK MIGRATION NO-GO:',error);
  process.exitCode=1;
});
