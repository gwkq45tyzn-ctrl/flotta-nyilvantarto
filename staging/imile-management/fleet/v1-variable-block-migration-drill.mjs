/**
 * #185 local Firestore emulator drill for unequal four-block sources.
 * Synthetic data only. Restarts are new objects that read persisted
 * checkpoints. Source readback is not a production closing approval.
 *
 * Large-prefix fail-closed: when the owned prefix exceeds OWNED_READ_BOUND
 * documents, importNext and close refuse with LARGE_PREFIX_REQUIRES_ISOLATION.
 * The client SDK cannot provide an atomic namespace lock for the full prefix.
 * Small prefixes keep the same-transaction owned CAS. All previous negatives
 * are preserved. This is not a production trust-root or IAM isolation.
 */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import {collection,doc,deleteDoc,getDoc,getDocs,setDoc,updateDoc,runTransaction}
  from 'firebase/firestore';
import {measureDocumentSet} from './v1-firestore-wire-size.mjs';
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
const FOUR_FORTY={drivers:220,vehicles:220,fuelCards:22,contacts:7};
const BLOCKS=['drivers','vehicles','fuelCards','contacts'];
const JOURNAL='v1SyntheticVariableBlockJournal/current';
const RECEIPTS='v1SyntheticVariableBlockChunks';
const SOURCE='flottaSharedState/current';
const APPROVAL='flottaMigrationApproval/current';
const KEYED=['flottaDrivers','flottaVehicles','flottaDriverClaims','flottaVehicleClaims'];
const OWNED_READ_BOUND=120;

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
    this.prepared=projectBlockPairs(source);
    this.source=structuredClone(source);
    const metadata={revision:1,sealed:false,migrationSourceSha256:this.prepared.sourceSha256};
    for(const [key,value] of Object.entries(metadata)){
      if(Object.hasOwn(source,key)&&source[key]!==value)throw Error('SOURCE_METADATA_COLLISION: '+key);
    }
    this.archive={...this.source,...metadata};
    this.archiveDigest=sha256(this.archive);
    const sourceBytes=measureDocumentSet(db,SOURCE,this.archive);
    let maxKeyedBytes=0;
    for(const pair of this.prepared.pairs){
      maxKeyedBytes=Math.max(maxKeyedBytes,measureDocumentSet(db,pair.masterPath,pair.master),
        measureDocumentSet(db,pair.claimPath,pair.claim));
    }
    this.wireSize={sourceBytes,maxKeyedBytes,measuredDocuments:1+2*this.prepared.pairs.length};
    this.chunks=chunkPairs(this.prepared.pairs,PAIR_CHUNK);
    this.journalRef=doc(db,...JOURNAL.split('/'));
    this.sourceRef=doc(db,...SOURCE.split('/'));
    this.approvalRef=doc(db,...APPROVAL.split('/'));
  }
  verifySource(archive){
    if(archive.sealed!==false||archive.revision!==1||
       archive.migrationSourceSha256!==this.prepared.sourceSha256)
      throw Error('SOURCE_SHA_OR_SEAL_DRIFT');
    if(sha256(archive)!==this.archiveDigest)throw Error('SOURCE_BLOCK_DRIFT');
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
    this.verifySource(sourceSnap.data());
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
        if(keyed[masterCol].has(pair.id))masters[pair.masterPath]=keyed[masterCol].get(pair.id);
        if(keyed[claimCol].has(pair.id))claims[pair.claimPath]=keyed[claimCol].get(pair.id);
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
  expectedReceipt(index){
    const chunk=this.chunks[index];
    return {
      chunkIndex:index,
      sourceSha256:this.prepared.sourceSha256,
      pairIds:chunk.map(pair=>pair.kind+'/'+pair.id),
      pairDigest:sha256(chunk.map(pair=>({
        id:pair.id,master:pair.master,claim:pair.claim
      })))
    };
  }
  prefixReadCount(from,to){
    return this.chunks.slice(from,to).reduce((sum,part)=>sum+part.length*2+1,0);
  }
  async assertOwnedChunks(tx,from,to){
    const refs=[];
    const expected=[];
    for(let i=from;i<to;i++){
      for(const pair of this.chunks[i]){
        refs.push(doc(this.db,...pair.masterPath.split('/')));
        expected.push(pair.master);
        refs.push(doc(this.db,...pair.claimPath.split('/')));
        expected.push(pair.claim);
      }
      refs.push(doc(this.db,RECEIPTS,String(i).padStart(4,'0')));
      expected.push(this.expectedReceipt(i));
    }
    if(refs.length>OWNED_READ_BOUND)
      throw Error('OWNED_READ_BOUND_EXCEEDED');
    const snaps=await Promise.all(refs.map(ref=>tx.get(ref)));
    for(let i=0;i<snaps.length;i++){
      if(!snaps[i].exists()||sha256(snaps[i].data())!==sha256(expected[i]))
        throw Error('OWNED_READBACK_MISMATCH');
    }
  }
  async verifyRollbackRemainder(fence){
    const sourceSnap=await getDoc(this.sourceRef);
    if(!sourceSnap.exists())throw Error('ORIGINAL_SOURCE_MISSING');
    this.verifySource(sourceSnap.data());
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
        if(master.exists())masters[pair.masterPath]=master.data();
        if(claim.exists())claims[pair.claimPath]=claim.data();
      }
      const assessed=assessChunkReadback({
        chunk,masters,claims,sourceSha256:this.prepared.sourceSha256
      });
      if(!assessed.ok)throw Error(assessed.reason);
    }
  }
  async importNext(options={}){
    if(this.chunks.length===0)throw Error('EMPTY_KEYED_PROJECTION');
    const fenceSnap=await getDoc(this.journalRef);
    if(fenceSnap.exists()&&fenceSnap.data().rollbackFence)
      throw Error('ROLLBACK_FENCE_HELD');
    const state=await this.verifyCommitted();
    if(state.closed)throw Error('CLOSED_REPLAY_DENIED');
    if(state.committed>=this.chunks.length)
      return {done:true,committed:state.committed,writes:0};
    if(options.afterVerify)await options.afterVerify(state);
    const index=state.committed;
    const prefixReads=this.prefixReadCount(0,index);
    // Fail-closed: large prefixes cannot be atomically protected by the
    // client SDK. Refuse rather than proceed with a non-atomic multiwindow
    // scan that a privileged writer can race.
    if(prefixReads>OWNED_READ_BOUND)
      throw Error('LARGE_PREFIX_REQUIRES_ISOLATION');
    const chunk=this.chunks[index];
    const receiptRef=doc(this.db,RECEIPTS,String(index).padStart(4,'0'));
    const paths=chunk.flatMap(pair=>[
      doc(this.db,...pair.masterPath.split('/')),
      doc(this.db,...pair.claimPath.split('/'))
    ]);
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
        if(!sourceSnap.exists())throw Error('ORIGINAL_SOURCE_MISSING');
        this.verifySource(sourceSnap.data());
      }else if(journalSnap.exists()||sourceSnap.exists()){
        throw Error('STALE_IMPORT_CHECKPOINT');
      }
      if(receiptSnap.exists())throw Error('CHUNK_RECEIPT_ALREADY_EXISTS');
      const current=await Promise.all(paths.map(ref=>tx.get(ref)));
      if(current.some(snap=>snap.exists()))
        throw Error('CHUNK_PATH_ALREADY_EXISTS');
      if(index>0)
        await this.assertOwnedChunks(tx,0,index);
      if(!state.journal){
        tx.set(this.sourceRef,this.archive);
      }
      for(const pair of chunk){
        tx.set(doc(this.db,...pair.masterPath.split('/')),pair.master);
        tx.set(doc(this.db,...pair.claimPath.split('/')),pair.claim);
      }
      tx.set(receiptRef,this.expectedReceipt(index));
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
      const expectedTargets=new Map();
      for(let i=deletedThrough;i<next;i++){
        const chunk=this.chunks[i];
        for(const pair of chunk){
          expectedTargets.set(pair.masterPath,pair.master);
          expectedTargets.set(pair.claimPath,pair.claim);
        }
        expectedTargets.set(RECEIPTS+'/'+String(i).padStart(4,'0'),
          this.expectedReceipt(i));
      }
      const finished=next===total;
      const expectedDeletedThrough=deletedThrough;
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
        this.verifySource(currentSource.data());
        const snapshots=await Promise.all(refs.map(ref=>tx.get(ref)));
        for(let i=0;i<snapshots.length;i++){
          const expected=expectedTargets.get(refs[i].path);
          if(!snapshots[i].exists()||sha256(snapshots[i].data())!==sha256(expected))
            throw Error('ROLLBACK_TARGET_MISMATCH');
          tx.delete(refs[i]);
        }
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
    if(state.closed)throw Error('ALREADY_CLOSED');
    if(state.committed!==this.chunks.length)
      throw Error('INCOMPLETE_IMPORT');
    const prefixReads=this.prefixReadCount(0,this.chunks.length);
    // Fail-closed for large prefixes. No production isolation exists.
    if(prefixReads>OWNED_READ_BOUND)
      throw Error('LARGE_PREFIX_REQUIRES_ISOLATION');
    const approval=await getDoc(this.approvalRef);
    const decision=localCloseDecision({
      sourceParity:true,
      approvalDocumentExists:approval.exists(),
      alreadyClosed:false
    });
    if(!decision.ok)throw Error(decision.reason);
    await runTransaction(this.db,async tx=>{
      const journalSnap=await tx.get(this.journalRef);
      if(!journalSnap.exists()||
         journalSnap.data().committedChunks!==this.chunks.length||
         journalSnap.data().sourceSha256!==this.prepared.sourceSha256||
         journalSnap.data().closed===true)
        throw Error('STALE_CLOSE_CHECKPOINT');
      await this.assertOwnedChunks(tx,0,this.chunks.length);
      tx.update(this.journalRef,{
        closed:true,
        sourceTrust:decision.sourceTrust,
        closingTrust:decision.closingTrust,
        sealed:false,
        authorizedForImport:false,
        productionClosingTrust:false,
        firestoreEncodedSizeVerified:false
      });
    },{maxAttempts:5});
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
    const closed=await session.close();
    assert.equal(closed.ok,true);
    assert.equal((await getDoc(session.journalRef)).data().closed,true);
    await assert.rejects(()=>session.importNext(),/CLOSED_REPLAY_DENIED/);
    await assert.rejects(()=>session.rollback(),/POST_CLOSE_ROLLBACK_DENIED/);
    await assert.rejects(()=>session.unseal(),/POST_CLOSE_UNSEAL_DENIED/);
    console.log('PASS DENY [E+SDK]: post-close import, rollback and unseal denied');
    await deleteDoc(session.journalRef);
    await deleteDoc(session.sourceRef);
    for(const pair of smallPrepared.pairs){
      await deleteDoc(doc(db,...pair.masterPath.split('/')));
      await deleteDoc(doc(db,...pair.claimPath.split('/')));
    }
    for(let i=0;i<smallPrepared.pairs.length;i++){
      await deleteDoc(doc(db,RECEIPTS,String(i).padStart(4,'0')));
    }
    const largeSource=syntheticFourBlockSource(LARGE);
    const largePrepared=projectBlockPairs(largeSource);
    assert.equal(largePrepared.pairs.length,290);
    let large=new VariableBlockSession(db,largeSource);
    // Large prefix must fail closed. No atomic protection exists.
    await assert.rejects(()=>large.importAll(),/LARGE_PREFIX_REQUIRES_ISOLATION/);
    console.log('PASS DENY [E+SDK]: 200/90/22/7 refuses import when prefix exceeds owned read bound');
    const fourFortySource=syntheticFourBlockSource(FOUR_FORTY);
    const fourFortyPrepared=projectBlockPairs(fourFortySource);
    assert.equal(fourFortyPrepared.pairs.length,440);
    let fourForty=new VariableBlockSession(db,fourFortySource);
    await assert.rejects(()=>fourForty.importAll(),/LARGE_PREFIX_REQUIRES_ISOLATION/);
    await assert.rejects(()=>fourForty.close(),/INCOMPLETE_IMPORT|LARGE_PREFIX_REQUIRES_ISOLATION/);
    console.log('PASS DENY [E+SDK]: 440-pair refuses import and close without privileged isolation');
    });
    summary.shapes.push({label:'12/14/14/5',pairs:26,ok:true});
    summary.shapes.push({label:'200/90/22/7',pairs:290,failClosed:true});
    summary.shapes.push({label:'220/220/22/7',pairs:440,failClosed:true});
  }finally{
    await env.cleanup();
  }
  console.log(JSON.stringify(summary,null,2));
}

main().catch(err=>{console.error(err);process.exitCode=1;});
