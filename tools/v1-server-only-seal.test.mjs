/**
 * Offline hostile authority tests for a server-only seal with NO release
 * permission. The genuine Firestore transaction is exercised separately
 * against the demo emulator, never faked by these offline tests.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServerOnlySeal} from './v1-server-only-seal.mjs';

const deny=r=>{
  assert.equal(r.ok,false,JSON.stringify(r));
  assert.equal(r.sealed,false);
  assert.equal(r.canSeal,false);
  assert.equal(r.authorizedForImport,false);
  assert.equal(r.productionIamVerified,false);
  assert.equal(r.externalSignerAuthenticated,false);
  assert.equal(r.externalTrustRootAuthenticityVerified,false);
  assert.equal(r.privilegedImporterVerified,false);
  assert.equal(r.atomicNamespaceSnapshotVerified,false);
  assert.equal(r.closedWriterSetVerified,false);
};
test('seal never authorized without an independently authenticated signer and server IAM',async()=>{
  const gate=createServerOnlySeal();
  deny(gate.attemptSeal({masters:440,claims:440}));
  deny(await gate.seal({signedSource:true,ready:true}));
});
test('caller may not confer authority with self-declared signer, IAM, root, cached success or inventory',async()=>{
  const gate=createServerOnlySeal({
    externalSignerAuthenticated:true,
    privilegedImporterVerified:true,
    productionIamVerified:true,
    ownerApproved:true
  });
  for(const forged of [
    {masters:440,claims:440,ok:true},
    {atomicNamespaceSnapshotVerified:true,canSeal:true},
    {validSignature:true,externalTrustRootAuthenticated:true},
    {sourceSha256:'f'.repeat(64),sourceIndex:0,seal:true}
  ])deny(gate.attemptSeal(forged));
  deny(await gate.seal({privilegedImporterVerified:true}));
});
test('a previous green preview and a later extra privileged claim cannot create a seal permission',async()=>{
  const gate=createServerOnlySeal();
  const green={ok:true,masterCount:440,claimCount:440};
  const late={ok:false,masterCount:440,claimCount:441,
    issues:['ORPHAN_CLAIM:drivers/DA9999']};
  deny(gate.attemptSeal(green));
  deny(gate.attemptSeal(late));
  deny(await gate.seal({priorPreview:green}));
});
test('a fake complete transaction-proof object supplied by caller never authorizes seal',async()=>{
  const gate=createServerOnlySeal();
  deny(gate.attemptSeal({
    knownWriteSetSnapshotVerified:true,
    knownWriteSetCount:24,
    fullyVerified:true,atomicNamespaceSnapshotVerified:true,
    provenanceSignerVerified:true,ownerApproved:true
  }));
  deny(await gate.seal());
});
test('no real SDK/emulator supplied is a hard failed content diagnostic, not a passed test',async()=>{
  const gate=createServerOnlySeal();
  const r=await gate.inspectBoundedKnownSet({
    projectId:'prod-should-not-be-contacted',
    expectedEpoch:1,
    independentlyPinnedSha:'f'.repeat(64),
    plan:{drivers:[],vehicles:[],sourceSha256:'f'.repeat(64)}
  });
  deny(r);
  assert.match(r.reason,/LOCAL_DEMO_FIRESTORE_EMULATOR_REQUIRED|LOCAL_KNOWNSET_INSPECTION_FAILED/);
});
test('a claimed root and importer can not upgrade a fake prior non-atomic scan',async()=>{
  const gate=createServerOnlySeal({
    externalSignerAuthenticated:true,
    privilegedImporterVerified:true
  });
  const r=await gate.inspectLocalEmulator({
    projectId:'prod-should-not-be-contacted',
    plan:{drivers:[],vehicles:[],sourceSha256:'f'.repeat(64)},
    expectedEpoch:1
  });
  deny(r);
  assert.match(r.reason,/NONATOMIC_NAMESPACE_DIAGNOSTIC_DENIED/);
});
