/**
 * Independently verifiable strict server-seal boundary controls.
 *
 * The original Grok test simulated a privileged orphan with plain JS
 * literals. Actual Firestore SDK attack is exercised by
 * staging/imile-management/fleet/v1-local-keyed-namespace-inventory.test.mjs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServerSealBoundary} from './v1-server-seal-boundary.mjs';

const deny=r=>{
  assert.equal(r.ok,false);
  assert.equal(r.canSeal,false);
  assert.equal(r.sealed,false);
  assert.equal(r.authorizedForImport,false);
  assert.equal(r.productionIamVerified,false);
  assert.equal(r.externalTrustRootAuthenticityVerified,false);
  assert.equal(r.privilegedImporterVerified,false);
  assert.equal(r.atomicNamespaceSnapshotVerified,false);
  assert.equal(r.closedWriterSetVerified,false);
};
test('no producer signer, no privileged importer and no actual closed writer set deny seal',()=>{
  const b=createServerSealBoundary();
  deny(b.attemptSeal({}));
  deny(b.attemptSeal(null));
  deny(b.attemptSeal());
  deny(b.attemptSeal({masters:440,claims:440}));
  assert.match(b.attemptSeal().reason,/AUTHORITY_UNAVAILABLE/);
});
test('caller-invented root/IAM booleans and "atomic" inventory fields never authorize anything',()=>{
  const b=createServerSealBoundary({
    externalTrustRootAuthenticated:true,
    privilegedImporterVerified:true,
    productionIamVerified:true,
    ownerApproved:true,
    proof:{passed:true}
  });
  for(const obj of [
    {masters:440,claims:440,ok:true},
    {ok:true,canSeal:true,atomicNamespaceSnapshotVerified:true},
    {sourceSha256:'f'.repeat(64),revision:1,allComplete:true},
    {seal:true,authenticatedOwner:true,externalRootValid:true},
    {sealed:true,authorizedForImport:true}
  ])deny(b.attemptSeal(obj));
  deny(await b.seal({ownerApproved:true,productionIamVerified:true}));
  deny(await b.claimProductionImporter({serviceAccount:'fake'}));
});
test('fake clean scan before late orphan is never promoted to a seal token',()=>{
  const b=createServerSealBoundary();
  const early={ok:true,masters:440,claims:440,sourceIndexVerified:true};
  const late={ok:false,masters:440,claims:441,orphanClaim:'DA9999'};
  deny(b.attemptSeal(early));
  deny(b.attemptSeal(late));
  deny(await b.seal({earlierCleanScan:early}));
});
test('user cannot redefine boundary to grant real production privileges',()=>{
  const b=createServerSealBoundary();
  b.productionIamVerified=true;
  b.canSeal=true;
  b.privilegedImporterVerified=true;
  b.externalTrustRootAuthenticated=true;
  deny(b.attemptSeal({canSeal:true}));
  deny(await b.seal());
});
test('invalid demo environment cannot be mistaken for trustworthy SDK inspection',async()=>{
  const b=createServerSealBoundary();
  const r=await b.inspectLocalEmulator({projectId:'prod-real-project',
    expectedEpoch:1,plan:{sourceSha256:'f'.repeat(64),drivers:[],vehicles:[]}});
  deny(r);
  assert.match(r.reason,/DIAGNOSTIC_DENIED|LOCAL_PREVIEW_ERROR/);
});
test('a fabricated SDK-result object is not accepted by diagnostic inspector',async()=>{
  const b=createServerSealBoundary();
  const fake={ok:true,canSeal:true,atomicNamespaceSnapshotVerified:true};
  const r=await b.inspectLocalEmulator(fake);
  deny(r);
  deny(b.attemptSeal(r));
});
