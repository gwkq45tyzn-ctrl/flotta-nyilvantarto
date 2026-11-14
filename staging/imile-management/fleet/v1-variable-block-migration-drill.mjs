/**
 * #185 local Firestore emulator drill for unequal four-block sources.
 * Synthetic data only. Restarts are new objects that read persisted
 * checkpoints. Source readback is not a production closing approval.
 */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import {collection,doc,deleteDoc,getDoc,getDocs,setDoc,updateDoc,writeBatch,runTransaction}
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
      if((await getDoc(this.sourceRef)).exists())throw Error('FOREIGN_WORKSPACE');
      const keyed=await this.loadKeyed();
      for(const name of KEYED){
        if(keyed[name].size)throw Error('FOREIGN_WORKSPACE');
      }
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
    // A privileged writer can change source arrays without changing the
    // stored SHA field. The interrupted rollback must not silently finish
    // against a different rich source snapshot.
    for(const block of BLOCKS){
      if(sha256(sourceData[block])!==sha256(this.source[block]))
        throw Error('SOURCE_BLOCK_DRIFT');
    }
    // Resume is safe only if the *entire* keyed/receipt workspace matches
    // exactly the not-yet-deleted chunk suffix. A new foreign master, claim
    // or receipt added during the rollback pause must block journal reset.
    const remaining={
      flottaDrivers:new Set(),flottaVehicles:new Set(),
      flottaDriverClaims:new Set(),flottaVehicleClaims:new Set()
    };
    const remainingReceipts=new Set();
    for(let i=fence.deletedThrough;i<fence.total;i++){
      remainingReceipts.add(String(i).padStart(4,'0'));
      for(const pair of this.chunks[i]){
        remaining[pair.masterPath.split('/')[0]].add(pair.id);
        remaining[pair.claimPath.split('/')[0]].add(pair.id);
      }
    }
    const liveKeyed=await this.loadKeyed();
    for(const [name,expected] of Object.entries(remaining)){
      const actual=liveKeyed[name];
      if(actual.size!==expected.size ||
         [...actual.keys()].some(id=>!expected.has(id)))
        throw Error(name.includes('Claims')?'ORPHAN_CLAIM':'ORPHAN_MASTER');
    }
    const liveReceipts=await getDocs(collection(this.db,RECEIPTS));
    if(liveReceipts.size!==remainingReceipts.size ||
       liveReceipts.docs.some(row=>!remainingReceipts.has(row.id)))
      throw Error('FORGED_OR_STALE_CHECKPOINT');
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
  async importNext(options={}){
    const fenceSnap=await getDoc(this.journalRef);
    if(fenceSnap.exists()&&fenceSnap.data().rollbackFence)
      throw Error('ROLLBACK_FENCE_HELD');
    const state=await this.verifyCommitted();
    if(state.closed)throw Error('CLOSED_REPLAY_DENIED');
    if(state.committed>=this.chunks.length)
      return {done:true,committed:state.committed,writes:0};
    // Test-only barrier forces two local sessions to observe the SAME
    // checkpoint. This staging emulator class is never a production importer.
    if(options.afterVerify)await options.afterVerify(state);
    const index=state.committed;
    const chunk=this.chunks[index];
    const receiptRef=doc(this.db,RECEIPTS,String(index).padStart(4,'0'));
    const paths=chunk.flatMap(pair=>[
      doc(this.db,...pair.masterPath.split('/')),
      doc(this.db,...pair.claimPath.split('/'))
    ]);
    // A batch.set() blindly overwrote the same journal and documents when
    // two importNext() calls observed committedChunks=N concurrently.
    // Atomic read + write on the persisted journal provides a CAS barrier
    // against two cooperating writers and a racing rollback cursor update.
    await runTransaction(this.db,async tx=>{
      const [journalSnap,sourceSnap,receiptSnap]=await Promise.all([
        tx.get(this.journalRef),tx.get(this.sourceRef),tx.get(receiptRef)
      ]);
      if(state.journal){
        if(!journalSnap.exists()||
           journalSnap.data().committedChunks!==index||
           journalSnap.data().sourceSha256!==this.prepared.sourceSha256||
           journalSnap.data().rollbackFence||
           journalSnap.data().closed===true)
          throw Error('STALE_IMPORT_CHECKPOINT');
        if(!sourceSnap.exists()||sourceSnap.data().sealed!==false||
           sourceSnap.data().revision!==1||
           sourceSnap.data().migrationSourceSha256!==this.prepared.sourceSha256)
          throw Error('SOURCE_SHA_OR_SEAL_DRIFT');
        for(const block of BLOCKS){
          if(sha256(sourceSnap.data()[block])!==sha256(this.source[block]))
            throw Error('SOURCE_BLOCK_DRIFT');
        }
      }else if(journalSnap.exists()||sourceSnap.exists()){
        throw Error('STALE_IMPORT_CHECKPOINT');
      }
      if(receiptSnap.exists())throw Error('CHUNK_RECEIPT_ALREADY_EXISTS');
      // No writes until ALL target paths have been checked in the same
      // transaction; a competing first writer must not overwrite them.
      const current=await Promise.all(paths.map(ref=>tx.get(ref)));
      if(current.some(snap=>snap.exists()))
        throw Error('CHUNK_PATH_ALREADY_EXISTS');
      if(!state.journal){
        tx.set(this.sourceRef,{
          ...this.source,revision:1,sealed:false,
          migrationSourceSha256:this.prepared.sourceSha256
        });
      }
      for(const pair of chunk){
        tx.set(doc(this.db,...pair.masterPath.split('/')),pair.master);
        tx.set(doc(this.db,...pair.claimPath.split('/')),pair.claim);
      }
      tx.set(receiptRef,{
        chunkIndex:index,
        sourceSha256:this.prepared.sourceSha256,
        pairIds:chunk.map(pair=>pair.kind+'/'+pair.id),
        pairDigest:sha256(chunk.map(pair=>({
          id:pair.id,master:pair.master,claim:pair.claim
        })))
      });
      tx.set(this.journalRef,this.journalBody(index+1));
    },{maxAttempts:5});
    return {done:false,committed:index+1,writes:chunk.length*2+1};
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
       maxWrites>MAX_BATCH_WRITES||
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
         fence.total>this.chunks.length||
         // A forged short fence must not reset the journal while later
         // receipted chunks and keyed masters still exist.
         fence.total!==journal.committedChunks)
        throw Error('ROLLBACK_FENCE_MISMATCH');
      await this.verifyRollbackRemainder(fence);
      deletedThrough=fence.deletedThrough;
      total=fence.total;
    }else{
      const state=await this.verifyCommitted();
      if(!state.journal)return {rollbackBatches:0};
      total=state.committed;
    }
    // Test-only pause lets a cooperating importer commit after this complete
    // ownership precheck but before the first destructive transaction.
    if(options.afterVerify)await options.afterVerify({deletedThrough,total});
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
      // Restrict the destructive transaction to exactly the receipt-owned
      // version of each master/claim. If a privileged process rewrites a
      // target AFTER the out-of-transaction preflight, deleting that new
      // content would silently discard someone else's data.
      const expectedTargets=new Map();
      for(let i=deletedThrough;i<next;i++){
        const chunk=this.chunks[i];
        for(const pair of chunk){
          expectedTargets.set(pair.masterPath,pair.master);
          expectedTargets.set(pair.claimPath,pair.claim);
        }
        expectedTargets.set(RECEIPTS+'/'+String(i).padStart(4,'0'),{
          chunkIndex:i,
          sourceSha256:this.prepared.sourceSha256,
          pairIds:chunk.map(pair=>pair.kind+'/'+pair.id),
          pairDigest:sha256(chunk.map(pair=>({
            id:pair.id,master:pair.master,claim:pair.claim
          })))
        });
      }
      const finished=next===total;
      const expectedDeletedThrough=deletedThrough;
      // A non-transactional writeBatch could reset a journal after an
      // importer committed a NEW chunk between rollback preflight and delete.
      // Read the journal + pinned source *inside* the transaction that deletes
      // this batch. Transactions conflict with the importer journal CAS.
      await runTransaction(this.db,async tx=>{
        const [currentJournal,currentSource]=await Promise.all([
          tx.get(this.journalRef),tx.get(this.sourceRef)
        ]);
        if(!currentJournal.exists()||!currentSource.exists())
          throw Error('ROLLBACK_FENCE_STALE');
        const data=currentJournal.data();
        if(data.committedChunks!==total||
           data.sourceSha256!==this.prepared.sourceSha256||
           data.closed===true)
          throw Error('ROLLBACK_FENCE_STALE');
        const fence=data.rollbackFence;
        if(expectedDeletedThrough===0){
          if(fence)throw Error('ROLLBACK_FENCE_STALE');
        }else if(!fence||
          fence.deletedThrough!==expectedDeletedThrough||
          fence.total!==total||
          fence.sourceSha256!==this.prepared.sourceSha256){
          throw Error('ROLLBACK_FENCE_STALE');
        }
        const archive=currentSource.data();
        if(archive.revision!==1||archive.sealed!==false||
           archive.migrationSourceSha256!==this.prepared.sourceSha256)
          throw Error('SOURCE_SHA_OR_SEAL_DRIFT');
        for(const block of BLOCKS){
          if(sha256(archive[block])!==sha256(this.source[block]))
            throw Error('SOURCE_BLOCK_DRIFT');
        }
        // Firestore revalidates all these transaction reads at commit; a
        // concurrent owner of a target row must cause retry then DENY, not
        // deletion of unverified content. The journal CAS alone cannot see
        // privileged modifications to keyed rows/receipts.
        const currentTargets=await Promise.all(refs.map(ref=>tx.get(ref)));
        for(let i=0;i<refs.length;i++){
          const snapshot=currentTargets[i],expected=expectedTargets.get(refs[i].path);
          if(!expected||!snapshot.exists()||
             sha256(snapshot.data())!==sha256(expected))
            throw Error('ROLLBACK_TARGET_CHANGED');
        }
        for(const ref of refs)tx.delete(ref);
        if(finished)tx.set(this.journalRef,this.journalBody(0));
        else tx.update(this.journalRef,{rollbackFence:{
          sourceSha256:this.prepared.sourceSha256,
          deletedThrough:next,
          total
        }});
      },{maxAttempts:5});
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
    const foreignSource=doc(db,'flottaSharedState','current');
    const foreignMaster=doc(db,'flottaDrivers','FOREIGN-KEEP');
    const foreignClaim=doc(db,'flottaDriverClaims','FOREIGN-KEEP');
    await setDoc(foreignSource,{sealed:true,revision:9,migrationSourceSha256:'ab'.repeat(32),
      drivers:[],vehicles:[],fuelCards:[],contacts:[]});
    await setDoc(foreignMaster,{owner:'other-import',sourceIndex:0});
    await setDoc(foreignClaim,{sourceIndex:0,revision:1});
    const cold=new VariableBlockSession(db,smallSource);
    await assert.rejects(()=>cold.importNext(),/FOREIGN_WORKSPACE/);
    await assert.rejects(()=>cold.rollback(),/FOREIGN_WORKSPACE/);
    assert.equal((await getDoc(foreignSource)).data().revision,9);
    assert.equal((await getDoc(foreignMaster)).data().owner,'other-import');
    assert.equal((await getDoc(foreignClaim)).exists(),true);
    await deleteDoc(foreignSource);
    await deleteDoc(foreignMaster);
    await deleteDoc(foreignClaim);
    console.log('PASS DENY [E+SDK]: journal-less cold start refuses a foreign source and keyed rows');
    let session=new VariableBlockSession(db,smallSource);
    let step=await session.importNext();
    assert.equal(step.committed,1);
    session=new VariableBlockSession(db,smallSource);
    assert.equal((await session.verifyCommitted()).committed,1);
    // Two independently constructed sessions both finish complete readback at
    // committedChunks=1 BEFORE either is allowed to start its transaction.
    // The old writeBatch path accepted both stale writers; the loser must
    // now be rejected by transactionally fenced journal CAS.
    let bothReady=0,releaseImportRace;
    const importRaceBarrier=new Promise(resolve=>{releaseImportRace=resolve;});
    const pauseAfterVerify=async state=>{
      assert.equal(state.committed,1);
      if(++bothReady===2)releaseImportRace();
      await importRaceBarrier;
    };
    const concurrent=await Promise.allSettled([
      new VariableBlockSession(db,smallSource).importNext({afterVerify:pauseAfterVerify}),
      new VariableBlockSession(db,smallSource).importNext({afterVerify:pauseAfterVerify})
    ]);
    assert.equal(concurrent.filter(x=>x.status==='fulfilled').length,1,
      'exactly one competing import chunk may commit');
    assert.equal(concurrent.filter(x=>x.status==='rejected').length,1,
      'the stale second importer must not advance the journal');
    assert.match(String(concurrent.find(x=>x.status==='rejected').reason),
      /STALE_IMPORT_CHECKPOINT|aborted|ABORTED/);
    session=new VariableBlockSession(db,smallSource);
    assert.equal((await session.verifyCommitted()).committed,2);
    assert.equal((await getDocs(collection(db,RECEIPTS))).size,2);
    console.log('PASS DENY [E+SDK]: simultaneous importNext sessions observing same checkpoint yield exactly one atomic chunk commit');
    // Reverse race: rollback has verified total=2, but a legal importer
    // advances the checkpoint to 3 BEFORE the destructive rollback batch.
    // The rollback transaction must reject, preserving all three chunks.
    let releaseStaleRollback,notifyRollbackChecked;
    const staleRollbackGate=new Promise(resolve=>{releaseStaleRollback=resolve;});
    const rollbackChecked=new Promise(resolve=>{notifyRollbackChecked=resolve;});
    const staleRollback=new VariableBlockSession(db,smallSource).rollback({
      afterVerify:async state=>{
        assert.equal(state.total,2);
        assert.equal(state.deletedThrough,0);
        notifyRollbackChecked();
        await staleRollbackGate;
      }
    });
    await rollbackChecked;
    const importerAhead=await new VariableBlockSession(db,smallSource).importNext();
    assert.equal(importerAhead.committed,3);
    releaseStaleRollback();
    await assert.rejects(staleRollback,/ROLLBACK_FENCE_STALE/);
    assert.equal((await new VariableBlockSession(db,smallSource).verifyCommitted()).committed,3);
    assert.equal((await getDocs(collection(db,RECEIPTS))).size,3);
    console.log('PASS DENY [E+SDK]: importer advances between rollback verification and delete; stale rollback cannot reset journal or erase chunks');
    // Deterministic importer/rollback race: importer has verified committed=3
    // but has not entered its atomic commit. Rollback resets the checkpoint
    // and deletes owned data. The stale importer must NOT recreate chunk 3.
    let releaseStaleImporter,notifyImportChecked;
    const staleImportGate=new Promise(resolve=>{releaseStaleImporter=resolve;});
    const importerChecked=new Promise(resolve=>{notifyImportChecked=resolve;});
    const staleImport=new VariableBlockSession(db,smallSource).importNext({
      afterVerify:async state=>{
        assert.equal(state.committed,3);
        notifyImportChecked();
        await staleImportGate;
      }
    });
    await importerChecked;
    const interruptedByRollback=await new VariableBlockSession(db,smallSource).rollback();
    assert.ok(interruptedByRollback.rollbackBatches>=1);
    releaseStaleImporter();
    await assert.rejects(staleImport,/STALE_IMPORT_CHECKPOINT/);
    assert.equal((await getDoc(session.journalRef)).data().committedChunks,0);
    assert.equal((await getDocs(collection(db,RECEIPTS))).size,0);
    console.log('PASS DENY [E+SDK]: rollback between importer verification and commit fences stale importer and preserves zero checkpoint');
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
    // Old resume validated only the expected suffix, ignored foreign rows,
    // then reset the journal to 0 while the injected master remained.
    await assert.rejects(()=>parked.rollback(),/ORPHAN_MASTER/);
    assert.equal((await getDoc(foreign)).data().owner,'other-import');
    assert.equal((await getDoc(doc(db,...late.masterPath.split('/')))).exists(),true);
    const stranger=new VariableBlockSession(db,syntheticFourBlockSource({
      drivers:3,vehicles:2,fuelCards:1,contacts:1
    }));
    await assert.rejects(()=>stranger.rollback(),/ROLLBACK_FENCE_MISMATCH/);
    assert.equal((await getDoc(foreign)).exists(),true);
    assert.equal((await getDoc(doc(db,...late.masterPath.split('/')))).exists(),true);
    // Forged rollback total equal to the already-deleted cursor used to
    // return success and reset committedChunks=0 with later chunks intact.
    const interruptedJournal=(await getDoc(parked.journalRef)).data();
    const actualTotal=interruptedJournal.rollbackFence.total;
    const partialTotal=interruptedJournal.rollbackFence.deletedThrough;
    assert.ok(partialTotal<actualTotal);
    await updateDoc(parked.journalRef,{'rollbackFence.total':partialTotal});
    await assert.rejects(()=>new VariableBlockSession(db,largeSource).rollback(),
      /ROLLBACK_FENCE_MISMATCH/);
    assert.equal((await getDoc(doc(db,...late.masterPath.split('/')))).exists(),true);
    await updateDoc(parked.journalRef,{'rollbackFence.total':actualTotal});
    console.log('PASS DENY [E+SDK]: forged short rollback fence cannot abandon later receipted chunks');
    // An unrelated claim arriving during a rollback pause must fail closed
    // without consuming the remaining owned chunks.
    await deleteDoc(foreign);
    const foreignResumeClaim=doc(db,'flottaDriverClaims','FOREIGN-CLAIM');
    await setDoc(foreignResumeClaim,{sourceIndex:0,revision:1});
    await assert.rejects(()=>parked.rollback(),/ORPHAN_CLAIM/);
    assert.equal((await getDoc(foreignResumeClaim)).exists(),true);
    assert.equal((await getDoc(doc(db,...late.masterPath.split('/')))).exists(),true);
    await deleteDoc(foreignResumeClaim);
    // A foreign receipt arriving between deletion batches is just as unsafe
    // as a foreign keyed document. It must not be silently ignored on resume.
    const foreignReceipt=doc(db,RECEIPTS,'FOREIGN-RECEIPT');
    await setDoc(foreignReceipt,{sourceSha256:largePrepared.sourceSha256,
      chunkIndex:999,pairIds:[],pairDigest:'0'.repeat(64)});
    await assert.rejects(()=>parked.rollback(),/FORGED_OR_STALE_CHECKPOINT/);
    assert.equal((await getDoc(foreignReceipt)).exists(),true);
    assert.equal((await getDoc(doc(db,...late.masterPath.split('/')))).exists(),true);
    await deleteDoc(foreignReceipt);
    // The hash stored in the source is not itself an authority: compare the
    // actual complete four rich arrays before resuming destructive work.
    const sourceSnapBefore=await getDoc(parked.sourceRef);
    const originalArchive=sourceSnapBefore.data();
    await updateDoc(parked.sourceRef,{contacts:[{id:'UNTRUSTED'}]});
    await assert.rejects(()=>parked.rollback(),/SOURCE_BLOCK_DRIFT/);
    assert.equal((await getDoc(doc(db,...late.masterPath.split('/')))).exists(),true);
    await updateDoc(parked.sourceRef,{contacts:originalArchive.contacts});
    console.log('PASS DENY [E+SDK]: resumed rollback rejects foreign master/claim and rich source drift without deleting remaining chunk');
    const resumed=new VariableBlockSession(db,largeSource);
    const rest=await resumed.rollback();
    assert.ok(rest.rollbackBatches>=1);
    assert.equal((await getDoc(doc(db,...late.masterPath.split('/')))).exists(),false);
    assert.equal((await getDoc(foreign)).exists(),false);
    console.log('PASS [E+SDK]: rollback crash resumes only after foreign records and source drift are cleared; all owned chunks deleted');
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
