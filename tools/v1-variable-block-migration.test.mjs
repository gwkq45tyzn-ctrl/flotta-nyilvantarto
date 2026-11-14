import test from 'node:test';
import assert from 'node:assert/strict';
import {
  syntheticFourBlockSource,projectBlockPairs,chunkPairs,writesForDeletes,
  assessChunkReadback,localCloseDecision,refuseUnseal,MAX_BATCH_WRITES
} from './v1-variable-block-migration.mjs';

const SMALL={drivers:12,vehicles:14,fuelCards:14,contacts:5};
const LARGE={drivers:200,vehicles:90,fuelCards:22,contacts:7};

test('production record count cannot be supplied by the caller',()=>{
  assert.throws(()=>syntheticFourBlockSource({
    ...SMALL,expectedProductionCount:12
  }),/PRODUCTION_RECORD_COUNT_MUST_NOT_BE_HARDCODED/);
  assert.throws(()=>syntheticFourBlockSource({
    ...SMALL,productionRecordCount:14
  }),/PRODUCTION_RECORD_COUNT_MUST_NOT_BE_HARDCODED/);
  assert.throws(()=>syntheticFourBlockSource({...SMALL,total:45}),
    /UNKNOWN_SOURCE_OPTION/);
});

test('unequal 12/14/14/5 projects 26 masters and 26 claims without closing trust',()=>{
  const source=syntheticFourBlockSource(SMALL);
  const projected=projectBlockPairs(source);
  assert.deepEqual(projected.counts,SMALL);
  assert.equal(projected.pairs.length,26);
  assert.equal(projected.pairs.filter(p=>p.kind==='drivers').length,12);
  assert.equal(projected.pairs.filter(p=>p.kind==='vehicles').length,14);
  assert.equal(new Set(projected.pairs.map(p=>p.claimPath)).size,26);
  assert.equal(projected.plan.sealed,false);
  assert.equal(projected.sourceTrust,'preflight-only');
  assert.equal(projected.closingTrust,'not-closed');
  assert.notEqual(projected.sourceTrust,projected.closingTrust);
  assert.equal(projected.firestoreEncodedSizeVerified,false);
  assert.equal(projected.authorizedForImport,false);
  assert.equal(projected.size.advisoryOk,true,projected.size.reason);
  assert.ok(projected.size.keyedStorageEstimates[projected.pairs[0].claimPath]>0);
  assert.equal(projected.pairs[0].master.history[0].text.includes('árvíztűrő'),true);
  const chunks=chunkPairs(projected.pairs);
  assert.deepEqual(chunks.map(c=>c.length),[8,8,8,2]);
  assert.equal(projected.pairs.filter(p=>p.kind==='drivers')
    .every((p,i)=>p.sourceIndex===i),true);
});

test('a larger unequal source is not a fixed pair total and rolls back in more than one batch',()=>{
  const projected=projectBlockPairs(syntheticFourBlockSource(LARGE));
  assert.notEqual(projected.counts.drivers,projected.counts.vehicles);
  assert.notEqual(projected.counts.fuelCards,projected.counts.contacts);
  assert.ok(projected.pairs.length>SMALL.drivers+SMALL.vehicles);
  const deletes=projected.pairs.length*2+chunkPairs(projected.pairs).length;
  const batches=writesForDeletes(deletes);
  assert.ok(batches.length>=2);
  assert.ok(batches.every(n=>n<=MAX_BATCH_WRITES));
  assert.equal(batches.reduce((sum,n)=>sum+n,0),deletes);
  assert.equal(projected.closingTrust,'not-closed');
  assert.equal(projected.firestoreEncodedSizeVerified,false);
});

test('oversized source is refused before any projected write',()=>{
  const huge=syntheticFourBlockSource({drivers:1,vehicles:1,fuelCards:0,contacts:0});
  huge.drivers[0].history[0].text='é'.repeat(700000);
  assert.throws(()=>projectBlockPairs(huge),/PREFLIGHT_DENIED/);
  const named=syntheticFourBlockSource({drivers:1,vehicles:1,fuelCards:0,contacts:0});
  named['a'.repeat(1600)]=true;
  assert.throws(()=>projectBlockPairs(named),/SIZE_GATE_DENIED_BEFORE_WRITE/);
});

test('resume denies missing, orphan, tampered history, duplicate sourceIndex and sha drift',()=>{
  const projected=projectBlockPairs(syntheticFourBlockSource(SMALL));
  const chunk=chunkPairs(projected.pairs)[0];
  const masters=Object.fromEntries(chunk.map(p=>[p.id,p.master]));
  const claims=Object.fromEntries(chunk.map(p=>[p.id,p.claim]));
  assert.equal(assessChunkReadback({
    chunk,masters,claims,sourceSha256:projected.sourceSha256
  }).ok,true);
  const missing={...masters};delete missing[chunk[0].id];
  assert.equal(assessChunkReadback({
    chunk,masters:missing,claims,sourceSha256:projected.sourceSha256
  }).reason,'ORPHAN_CLAIM');
  const tampered=structuredClone(masters);
  tampered[chunk[0].id].history=[];
  assert.equal(assessChunkReadback({
    chunk,masters:tampered,claims,sourceSha256:projected.sourceSha256
  }).reason,'RICH_MASTER_MISMATCH');
  const extra={...masters,ROGUE:{...chunk[0].master}};
  assert.equal(assessChunkReadback({
    chunk,masters:extra,claims,sourceSha256:projected.sourceSha256
  }).reason,'ORPHAN_MASTER');
  const duplicated=structuredClone(chunk);
  duplicated[1]={...duplicated[1],claim:{...duplicated[1].claim,
    sourceIndex:duplicated[0].sourceIndex}};
  const dupMasters=Object.fromEntries(duplicated.map(p=>[p.id,p.master]));
  const dupClaims=Object.fromEntries(duplicated.map(p=>[p.id,p.claim]));
  assert.equal(assessChunkReadback({
    chunk:duplicated,masters:dupMasters,claims:dupClaims,
    sourceSha256:projected.sourceSha256
  }).reason,'DUPLICATE_SOURCE_INDEX');
  assert.equal(assessChunkReadback({
    chunk,masters,claims,sourceSha256:'ab'.repeat(32)
  }).reason,'SOURCE_SHA_DRIFT');
});

test('local close is not a migration approval and cannot be unsealed or replayed',()=>{
  const denied=localCloseDecision({
    sourceParity:true,approvalDocumentExists:true,alreadyClosed:false
  });
  assert.equal(denied.ok,false);
  assert.match(denied.reason,/CLOSING_TRUST_MUST_NOT_BE_MIGRATION_APPROVAL/);
  assert.equal(localCloseDecision({
    sourceParity:false,approvalDocumentExists:false,alreadyClosed:false
  }).reason,'SOURCE_TRUST_INCOMPLETE');
  const closed=localCloseDecision({
    sourceParity:true,approvalDocumentExists:false,alreadyClosed:false
  });
  assert.equal(closed.ok,true);
  assert.equal(closed.sourceTrust,'readback-verified');
  assert.equal(closed.closingTrust,'locally-closed-not-production');
  assert.notEqual(closed.sourceTrust,closed.closingTrust);
  assert.equal(closed.sealed,false);
  assert.equal(closed.authorizedForImport,false);
  assert.equal(closed.productionClosingTrust,false);
  assert.equal(closed.firestoreEncodedSizeVerified,false);
  assert.equal(localCloseDecision({
    sourceParity:true,approvalDocumentExists:false,alreadyClosed:true
  }).reason,'CLOSED_REPLAY_DENIED');
  assert.equal(refuseUnseal({
    closed:true,closingTrust:'locally-closed-not-production'
  }).reason,'POST_CLOSE_UNSEAL_DENIED');
});
