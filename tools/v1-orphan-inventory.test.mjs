import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {inventoryKeyedState} from './v1-orphan-inventory.mjs';
import {createSignedManifestContract} from './v1-signed-manifest-contract.mjs';
import {buildPlan,sha256,simulateBackup} from './v1-migration-dryrun.mjs';
import {canonicalStringify} from '../features/migration-manifest.mjs';

const raw=()=>({
  drivers:[
    {id:'source-1',daCode:'DA0001',name:'Synthetic A',status:'aktiv',
      kapacitas:80,history:[{kind:'hire',details:{unicode:'Árvíztűrő',nested:[1,{keep:true}]}}]},
    {id:'source-2',daCode:'DA0002',name:'Synthetic B',status:'aktiv',
      kapacitas:70,history:[{kind:'rename',notes:'Not real'}]}
  ],
  vehicles:[{id:'source-v1',rendszam:'ABC-123',status:'aktiv',
    history:[{kind:'service',future:{parts:[{synthetic:true}]}}]}],
  fuelCards:[{id:'synthetic-fuel',history:[{amount:0}]}],
  contacts:[{id:'synthetic-contact',notes:'No real phone'}]
});
const clone=o=>structuredClone(o);
const materialize=plan=>{
  const masters=Object.create(null),claims=Object.create(null);
  for(const kind of ['drivers','vehicles'])for(const e of plan[kind]){
    const key=kind+'/'+e.id;
    masters[key]=clone(e.data);
    claims[key]={
      normalizedId:e.id,sourceIndex:e.data.sourceIndex,revision:e.data.revision,
      migrationSourceSha256:plan.sourceSha256,masterSha256:sha256(e.data)
    };
  }
  return {masters,claims};
};
const denyInventory=(v,regex)=>{
  assert.equal(v.ok,false,JSON.stringify(v));
  assert.equal(v.sealed,false);
  assert.equal(v.canSeal,false);
  assert.equal(v.authoritativeNamespaceVerified,false);
  if(regex)assert.ok(v.issues.some(e=>regex.test(e)),JSON.stringify(v.issues));
};
const denySigned=(v,re)=>{
  assert.equal(v.ok,false,JSON.stringify(v));assert.equal(v.sealed,false);
  assert.equal(v.canSeal,false);
  assert.equal(v.authorizedForImport,false);
  assert.equal(v.productionIamVerified,false);
  assert.equal(v.signatureIntegrityVerified,false);
  if(re)assert.match(v.reason,re);
};
const signedFixture=source=>{
  // Test-only volatile owner keypair. Neither real owner nor production IAM.
  const pair=generateKeyPairSync('ed25519');
  const spki=pair.publicKey.export({format:'der',type:'spki'}).toString('base64');
  const plan=buildPlan(source);
  const keys=[
    ...plan.drivers.map(d=>'drivers/'+d.id),
    ...plan.vehicles.map(v=>'vehicles/'+v.id)
  ].sort();
  const payload={
    schema:'imile-v1-offline-fleet-manifest-v1',
    purpose:'synthetic-preseal-dry-run',signerId:'local-test-owner',
    projectId:'demo-imile-v1-manifest',
    sourceSha256:sha256(source),sourceRevision:1,
    canonicalPlanDigest:sha256(keys)
  };
  const manifest={
    algorithm:'Ed25519',payload,
    signatureBase64:sign(null,Buffer.from(canonicalStringify(payload),'utf8'),
      pair.privateKey).toString('base64')
  };
  const contract=()=>createSignedManifestContract({
    trustedPublicKeySpkiBase64:spki,
    expectedSignerId:'local-test-owner',
    expectedProjectId:'demo-imile-v1-manifest',
    independentlyPinnedSourceSha256:sha256(source),
    expectedRevision:1
  });
  return {pair,manifest,contract,spki};
};
test('full rich exact master+claim materialized parity; deliberately NOT sealable or atomic',()=>{
  const plan=buildPlan(raw());
  const obs=materialize(plan);
  const result=inventoryKeyedState(plan,obs);
  assert.equal(result.ok,true,JSON.stringify(result));
  assert.equal(result.expectedCount,3);
  assert.equal(result.observedMasterCount,3);
  assert.equal(result.observedClaimCount,3);
  assert.equal(result.authoritativeNamespaceVerified,false);
  assert.equal(result.atomicNamespaceSnapshotVerified,false);
  assert.equal(result.canSeal,false);
  assert.equal(result.authorizedForImport,false);
});
test('extra master/claim and missing corresponding document fail closed',()=>{
  const plan=buildPlan(raw()),obs=materialize(plan);
  obs.masters['drivers/DA9999']={malicious:true};
  obs.claims['vehicles/ORPHAN']={malicious:true};
  delete obs.masters['vehicles/ABC123'];
  delete obs.claims['drivers/DA0002'];
  const v=inventoryKeyedState(plan,obs);
  denyInventory(v,/ORPHAN_MASTER/);
  denyInventory(v,/ORPHAN_CLAIM/);
  denyInventory(v,/MISSING_MASTER/);
  denyInventory(v,/MISSING_CLAIM/);
});
test('master with correct ID but altered rich nested history fails',()=>{
  const plan=buildPlan(raw()),obs=materialize(plan);
  obs.masters['drivers/DA0001'].history[0].details.nested[1].keep=false;
  denyInventory(inventoryKeyedState(plan,obs),/RICH_MASTER_MISMATCH:drivers\/DA0001/);
});
test('correct names but forged claim index, revision, SHA and unexpected field fail',()=>{
  const plan=buildPlan(raw());
  for(const mutate of [
    c=>c.sourceIndex=0xBAD,
    c=>c.revision+=1,
    c=>c.masterSha256='f'.repeat(64),
    c=>c.migrationSourceSha256='f'.repeat(64),
    c=>c.forgedAuthority=true
  ]){
    const obs=materialize(plan);
    mutate(obs.claims['drivers/DA0001']);
    denyInventory(inventoryKeyedState(plan,obs),/CLAIM_PARITY_MISMATCH/);
  }
});
test('a content-only caller-supplied snapshot cannot be called authoritative',()=>{
  const plan=buildPlan(raw()),obs=materialize(plan);
  assert.equal(inventoryKeyedState(plan,obs).ok,true);
  obs.claims['drivers/DA9999']={forged:true};
  denyInventory(inventoryKeyedState(plan,obs),/ORPHAN_CLAIM/);
  // This illustrates TOCTOU: a prior successful snapshot is NOT a seal proof.
  assert.equal(inventoryKeyedState(plan,materialize(plan)).atomicNamespaceSnapshotVerified,false);
});
test('malformed plan and observed namespace fail closed, not silent vacuous match',()=>{
  for(const [p,o] of [
    [null,materialize(buildPlan(raw()))],
    [{drivers:[],vehicles:[]},{}],
    [buildPlan(raw()),{}],
    [buildPlan(raw()),{masters:[],claims:{}}],
    [buildPlan(raw()),{masters:null,claims:null}]
  ])denyInventory(inventoryKeyedState(p,o));
});
test('cryptographic Ed25519 signed full-rich source verifies local integrity ONLY',()=>{
  const source=raw(),{manifest,contract}=signedFixture(source);
  const r=contract().verify(source,manifest,{backup:simulateBackup(source)});
  assert.equal(r.ok,true,JSON.stringify(r));
  assert.equal(r.signatureIntegrityVerified,true);
  assert.equal(r.expectedKeyedMasterCount,3);
  assert.equal(r.sealed,false);assert.equal(r.canSeal,false);
  assert.equal(r.authorizedForImport,false);
  assert.equal(r.productionIamVerified,false);
  assert.equal(r.externalTrustRootAuthenticityVerified,false);
  assert.equal(r.authenticatedExternalSignerProvenanceVerified,false);
});
test('no public verification root always refuses, even when pin is right',()=>{
  const source=raw(),{manifest}=signedFixture(source);
  const c=createSignedManifestContract();
  denySigned(c.verify(source,manifest,{backup:simulateBackup(source)}),/NO_EXTERNAL_TRUST_ROOT/);
});
test('Grok signature == public root string forgery no longer passes',()=>{
  const source=raw(),{manifest,spki}=signedFixture(source);
  const c=createSignedManifestContract({
    trustedPublicKeySpkiBase64:spki,
    expectedSignerId:'local-test-owner',
    independentlyPinnedSourceSha256:sha256(source)
  });
  const forged=clone(manifest);
  forged.signatureBase64=spki;
  denySigned(c.verify(source,forged,{backup:simulateBackup(source)}),/ED25519_SIGNATURE_VERIFICATION_FAILED/);
});
test('wrong private key signature, payload tamper, revision change and project change fail',()=>{
  const source=raw(),{manifest,contract}=signedFixture(source);
  const another=generateKeyPairSync('ed25519');
  const fake=clone(manifest);
  fake.signatureBase64=sign(null,Buffer.from(canonicalStringify(fake.payload),'utf8'),
    another.privateKey).toString('base64');
  denySigned(contract().verify(source,fake,{backup:simulateBackup(source)}),/ED25519_SIGNATURE_VERIFICATION_FAILED/);
  for(const mut of [
    m=>m.payload.sourceSha256='f'.repeat(64),
    m=>m.payload.canonicalPlanDigest='a'.repeat(64),
    m=>m.payload.sourceRevision=2,
    m=>m.payload.projectId='demo-attacker',
    m=>m.payload.purpose='seal-production'
  ]){
    const mod=clone(manifest);mut(mod);
    denySigned(contract().verify(source,mod,{backup:simulateBackup(source)}));
  }
});
test('valid signature but source/backup drift or normalized duplicates denied',()=>{
  const source=raw(),{manifest,contract}=signedFixture(source);
  const changed=clone(source);changed.drivers[0].history[0].details.unicode='FORGED';
  denySigned(contract().verify(changed,manifest,{backup:simulateBackup(source)}),/SOURCE_SHA_MISMATCH/);
  denySigned(contract().verify(source,manifest,{}),/PINNED_RICH_SOURCE_DENIED/);
  const forgedBackup=simulateBackup(source);
  forgedBackup.snapshot.vehicles[0].history[0].kind='hacked';
  forgedBackup.sourceSha256=sha256(forgedBackup.snapshot);
  denySigned(contract().verify(source,manifest,{backup:forgedBackup}),/PINNED_RICH_SOURCE_DENIED/);
  const poisoned=raw();poisoned.drivers[1].daCode='da0001';
  const hacked=clone(manifest);
  hacked.payload.sourceSha256=sha256(poisoned);
  denySigned(contract().verify(poisoned,hacked,{backup:{
    type:'v1-full-rich-backup',version:2,imported:false,
    sourceSha256:sha256(poisoned),snapshot:poisoned,
    counts:{drivers:2,vehicles:1,fuelCards:1,contacts:1}
  }}));
});
test('malformed Ed25519 or fake authority options always DENY',()=>{
  const source=raw(),{manifest,contract}=signedFixture(source);
  for(const mutation of [
    m=>m.algorithm='sha256',
    m=>m.signatureBase64='fake',
    m=>m.payload.extraPrivilege=true,
    m=>m.authorizedForImport=true
  ]){
    const mod=clone(manifest);mutation(mod);
    denySigned(contract().verify(source,mod,{backup:simulateBackup(source)}));
  }
  assert.throws(()=>createSignedManifestContract({
    trustedPublicKeySpkiBase64:'external-test-root'
  }),/INVALID_ED25519_PUBLIC_ROOT/);
});
