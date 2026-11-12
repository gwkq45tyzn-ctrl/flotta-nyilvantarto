/**
 * Real Ed25519 TWO-SIGNATURE chain:
 * ephemeral root signs OFFLINE registry, registry-selected key signs
 * original Fleet full-rich source manifest. NO real owner key or IAM.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,createHash,sign as signMessage} from 'node:crypto';
import {createTrustedSignerContract} from './v1-trusted-signer-contract.mjs';
import {sha256,simulateBackup,buildPlan} from './v1-migration-dryrun.mjs';
import {canonicalStringify} from '../features/migration-manifest.mjs';
const clone=structuredClone;
const project='demo-imile-v1-manifest';
const audience='demo-imile-v1-owner-registry';
const signerId='local-test-owner';
const keypair=()=>{
  const keys=generateKeyPairSync('ed25519');
  const der=keys.publicKey.export({type:'spki',format:'der'});
  return {privateKey:keys.privateKey,
    publicKeySpkiBase64:der.toString('base64'),
    fingerprint:createHash('sha256').update(der).digest('hex')};
};
const source=()=>({
  drivers:[
    {id:'source-d1',daCode:'DA0001',name:'Synthetic A',kapacitas:100,status:'aktiv',
      history:[{event:'onboard',nested:{unicode:'Árvíztűrő',future:[{a:true}]}}]},
    {id:'source-d2',daCode:'DA0002',name:'Synthetic B',kapacitas:45,status:'aktiv',
      history:[{event:'route',route:{from:'none',to:'synthetic'}}]}
  ],
  vehicles:[{id:'source-v1',rendszam:'ABC-123',status:'aktiv',
    history:[{event:'service',nested:{parts:[1,2,3]}}]}],
  fuelCards:[{id:'synthetic-fuel',history:[{value:0}]}],
  contacts:[{id:'synthetic-contact',extra:{privacy:'no real personal data'}}],
  futureRoot:{nested:{keep:'forever'}}
});
const signEnvelope=(payload,key)=>({
  algorithm:'Ed25519',payload,
  signatureBase64:signMessage(null,Buffer.from(canonicalStringify(payload),'utf8'),
    key.privateKey).toString('base64')
});
const make=()=> {
  const root=keypair(),signer=keypair(),raw=source(),backup=simulateBackup(raw);
  const now=Date.now();
  const interval={notBeforeMs:now-60000,expiresAtMs:now+3600000};
  const registry={
    schema:'imile-v1-offline-owner-signer-registry-v1',
    purpose:'synthetic-root-signed-fleet-manifest-registry',
    registryAudience:audience,sourceProjectId:project,
    sequence:1,...interval,
    signers:[{
      signerId,keyVersion:1,
      publicKeySpkiBase64:signer.publicKeySpkiBase64,
      status:'active',...interval
    }],
    revokedSignerFingerprints:[]
  };
  const plan=buildPlan(raw);
  const manifest={
    schema:'imile-v1-offline-fleet-manifest-v1',
    purpose:'synthetic-preseal-dry-run',
    signerId,projectId:project,
    sourceSha256:sha256(raw),
    sourceRevision:1,
    canonicalPlanDigest:sha256([
      ...plan.drivers.map(x=>'drivers/'+x.id),
      ...plan.vehicles.map(x=>'vehicles/'+x.id)
    ].sort())
  };
  const contractConfig={
    rootPublicKeySpkiBase64:root.publicKeySpkiBase64,
    independentlyPinnedRootSha256:root.fingerprint,
    expectedRegistryAudience:audience,expectedProjectId:project,
    expectedSignerId:signerId,independentlyPinnedSourceSha256:sha256(raw),
    expectedSourceRevision:1,minimumTrustedRegistrySequence:1,
    minimumSignerKeyVersion:1
  };
  return {
    root,signer,raw,backup,interval,registry,manifest,contractConfig,
    registryBundle:signEnvelope(registry,root),
    signedManifest:signEnvelope(manifest,signer)
  };
};
const execute=(fixture,cfg)=>{
  const contract=createTrustedSignerContract({...fixture.contractConfig,...cfg});
  return contract.verify({
    registryBundle:fixture.registryBundle,
    manifest:fixture.signedManifest,
    snapshot:fixture.raw,backup:fixture.backup
  });
};
const denied=(r,re)=>{
  assert.equal(r.ok,false,JSON.stringify(r));
  assert.equal(r.canSeal,false);
  assert.equal(r.sealed,false);
  assert.equal(r.authorizedForImport,false);
  assert.equal(r.productionIamVerified,false);
  assert.equal(r.externalTrustRootAuthenticityVerified,false);
  assert.equal(r.authenticatedExternalSignerProvenanceVerified,false);
  if(re)assert.match(r.reason,re);
};
const accepted=r=>{
  assert.equal(r.ok,true,JSON.stringify(r));
  assert.equal(r.signatureChainIntegrityVerified,true);
  assert.equal(r.expectedKeyedMasterCount,3);
  assert.equal(r.sealed,false);
  assert.equal(r.canSeal,false);
  assert.equal(r.authorizedForImport,false);
  assert.equal(r.productionIamVerified,false);
  assert.equal(r.externalTrustRootAuthenticityVerified,false);
  assert.equal(r.authenticatedExternalSignerProvenanceVerified,false);
  assert.equal(r.registryFreshnessVerified,false);
  assert.equal(r.trustedClockVerified,false);
};
test('no independently pinned external root/registry always NO-AUTHORITY, fail closed',()=>{
  const f=make();
  denied(createTrustedSignerContract().verify({
    registryBundle:f.registryBundle,manifest:f.signedManifest,
    snapshot:f.raw,backup:f.backup
  }),/NO_EXTERNAL_OWNER_REGISTRY_ROOT/);
});
test('genuine root Ed25519 signed offline registry + selected signer signed original full-rich source PASS as content ONLY',()=>{
  const f=make();
  const result=execute(f);
  accepted(result);
  assert.equal(result.localRegistrySequence,1);
  assert.equal(result.localSignerKeyVersion,1);
  assert.equal(result.fullRichSourceSha256,sha256(f.raw));
  assert.equal(result.localRootFingerprint,f.root.fingerprint);
  assert.equal(result.localSignerFingerprint,f.signer.fingerprint);
});
test('Grok raw equal signer ID without root signature cannot falsely pass',()=>{
  const f=make();
  f.registryBundle.signatureBase64='root-public-string';
  denied(execute(f),/INVALID_OFFLINE_SIGNER_REGISTRY_OR_SOURCE/);
});
test('attacker-selected signer ID and newly self-signed registry without pinned owner root DENY',()=>{
  const f=make();
  const attacker=keypair();
  f.registry.signers[0].publicKeySpkiBase64=attacker.publicKeySpkiBase64;
  f.registryBundle=signEnvelope(f.registry,attacker);
  f.signedManifest=signEnvelope(f.manifest,attacker);
  denied(execute(f),/REGISTRY_ED25519_SIGNATURE_INVALID/);
  const forged=make();
  const selfChosen=execute(forged);
  accepted(selfChosen);
  // Counterexample: the entire TEST registry and root can be self-chosen.
  // Actual OWNER authentication cannot be claimed from this local success.
  assert.equal(selfChosen.ownerApprovalAuthenticated,false);
  assert.equal(selfChosen.productionIamVerified,false);
});
test('wrong root fingerprint/DER/algorithm or missing root identity fail closed',()=>{
  const f=make(),attacker=keypair();
  assert.throws(()=>createTrustedSignerContract({
    ...f.contractConfig,
    independentlyPinnedRootSha256:attacker.fingerprint
  }),/PINNED_OWNER_ROOT_FINGERPRINT_MISMATCH/);
  assert.throws(()=>createTrustedSignerContract({
    ...f.contractConfig,
    rootPublicKeySpkiBase64:'not an Ed25519 key'
  }),/INVALID_PINNED_ED25519_ROOT/);
  f.registryBundle.algorithm='hash-only';
  denied(execute(f),/INVALID_OWNER_REGISTRY_ENVELOPE/);
});
test('registry signed content tampering (version, signer ID/key, audience, project, expiry, revocation) DENY',()=>{
  const mutations=[
    r=>r.sequence=123,
    r=>r.signers[0].publicKeySpkiBase64=keypair().publicKeySpkiBase64,
    r=>r.signers[0].signerId='attacker',
    r=>r.registryAudience='demo-attacker-registry',
    r=>r.sourceProjectId='demo-attacker',
    r=>r.expiresAtMs+=100000,
    r=>r.revokedSignerFingerprints.push('a'.repeat(64))
  ];
  for(const mutate of mutations){
    const f=make();mutate(f.registry);
    const res=execute(f);
    denied(res);
  }
});
test('source signed manifest altered nested history, source hash, plan digest, signer and project DENY',()=>{
  const muts=[
    f=>f.raw.drivers[0].history[0].nested.unicode='FORGED',
    f=>f.manifest.sourceSha256='f'.repeat(64),
    f=>f.manifest.canonicalPlanDigest='f'.repeat(64),
    f=>f.manifest.signerId='attacker',
    f=>f.manifest.projectId='demo-attacker'
  ];
  for(const mutate of muts){
    const f=make();mutate(f);
    denied(execute(f));
  }
});
test('valid registry but wrong signing key signature on original source denied',()=>{
  const f=make();
  f.signedManifest=signEnvelope(f.manifest,keypair());
  denied(execute(f),/RICH_SOURCE_MANIFEST_SIGNATURE_OR_BACKUP_DENIED/);
});
test('full-rich preimport backup tampering, wrong counts and duplicated normalized DA DENY',()=>{
  for(const mutate of [
    f=>f.backup.snapshot.drivers[0].history[0].nested.unicode='HACKED',
    f=>f.backup.counts.drivers=99,
    f=>{f.raw.drivers[1].daCode='da0001';}
  ]){
    const f=make();mutate(f);
    denied(execute(f));
  }
});
test('registry revoked signer, disabled signer, expired key or expired registry DENY',()=>{
  const muts=[
    f=>f.registry.revokedSignerFingerprints=[f.signer.fingerprint],
    f=>f.registry.signers[0].status='disabled',
    f=>{f.registry.signers[0].expiresAtMs=Date.now()-1},
    f=>{f.registry.expiresAtMs=Date.now()-1}
  ];
  for(const mutate of muts){
    const f=make();mutate(f);f.registryBundle=signEnvelope(f.registry,f.root);
    denied(execute(f));
  }
});
test('caller-supplied registry signer, pin, now, IAM, approval or missing backup DENY',()=>{
  const f=make(),c=createTrustedSignerContract(f.contractConfig);
  const input={
    registryBundle:f.registryBundle,manifest:f.signedManifest,
    snapshot:f.raw,backup:f.backup
  };
  for(const extra of [
    {signerId:'attacker'},{externalRegistryEntry:{signerId}},
    {externalSignerAuthenticated:true},{ownerApproved:true},
    {productionIamVerified:true},{now:0},{root:f.root.publicKeySpkiBase64},
    {expectedRevision:1},{externalSourcePin:sha256(f.raw)}
  ])denied(c.verify({...input,...extra}),/UNTRUSTED_CALLER_AUTHORITY/);
  const incomplete={...input};delete incomplete.backup;
  denied(c.verify(incomplete),/UNTRUSTED_CALLER_AUTHORITY/);
});
test('local signed registry version floor and pinned key version reject old or rolled-back data',()=>{
  const f=make();
  denied(execute(f,{minimumTrustedRegistrySequence:2}),
    /SIGNED_REGISTRY_CONTEXT_REVISION_OR_REVOCATION_INVALID/);
  denied(execute(f,{minimumSignerKeyVersion:2}),
    /SIGNER_KEY_VERSION_BELOW_PINNED_FLOOR/);
});
test('signed rotation to version 2 rejects old signer signature, and signed registry replay is blocked in-instance',()=>{
  const f=make();
  const c=createTrustedSignerContract(f.contractConfig);
  const input=()=>({
    registryBundle:f.registryBundle,manifest:f.signedManifest,
    snapshot:f.raw,backup:f.backup
  });
  accepted(c.verify(input()));
  const oldBundle=clone(f.registryBundle);
  const next=keypair();
  f.registry.sequence=2;
  f.registry.signers.push({
    ...f.registry.signers[0],
    keyVersion:2,publicKeySpkiBase64:next.publicKeySpkiBase64
  });
  f.registryBundle=signEnvelope(f.registry,f.root);
  denied(c.verify(input()),/RICH_SOURCE_MANIFEST_SIGNATURE_OR_BACKUP_DENIED/);
  f.signedManifest=signEnvelope(f.manifest,next);
  accepted(c.verify(input()));
  f.registryBundle=oldBundle;
  denied(c.verify(input()),/LOCAL_REGISTRY_REPLAY_OR_EQUIVOCATION_DENIED/);
  f.registry.sequence=2;
  f.registry.signers[1].status='disabled';
  f.registryBundle=signEnvelope(f.registry,f.root);
  denied(c.verify(input()),/LOCAL_REGISTRY_REPLAY_OR_EQUIVOCATION_DENIED/);
});
test('new signed revocation blocks fallback to older accepted registry even when new registry denies',()=>{
  const f=make(),c=createTrustedSignerContract(f.contractConfig);
  const input=()=>({
    registryBundle:f.registryBundle,manifest:f.signedManifest,
    snapshot:f.raw,backup:f.backup
  });
  accepted(c.verify(input()));
  const older=clone(f.registryBundle);
  f.registry.sequence=2;
  f.registry.revokedSignerFingerprints=[f.signer.fingerprint];
  f.registryBundle=signEnvelope(f.registry,f.root);
  denied(c.verify(input()),/SIGNER_EXPIRED_DISABLED_OR_REVOKED/);
  f.registryBundle=older;
  denied(c.verify(input()),/LOCAL_REGISTRY_REPLAY_OR_EQUIVOCATION_DENIED/);
});
test('registry is not durable across new instances, proof flags never claim antirollback after restart',()=>{
  const f=make(),oldRegistry=clone(f.registryBundle);
  const contract=createTrustedSignerContract(f.contractConfig);
  const input=()=>({
    registryBundle:f.registryBundle,manifest:f.signedManifest,
    snapshot:f.raw,backup:f.backup
  });
  accepted(contract.verify(input()));
  f.registry.sequence=2;f.registryBundle=signEnvelope(f.registry,f.root);
  accepted(contract.verify(input()));
  f.registryBundle=oldRegistry;
  denied(contract.verify(input()),/LOCAL_REGISTRY_REPLAY_OR_EQUIVOCATION_DENIED/);
  // A fresh local object has NO durable highwater. This is NOT a
  // production anti-rollback registry or trusted owner authority.
  const fresh=createTrustedSignerContract(f.contractConfig);
  const proof=fresh.verify(input());
  accepted(proof);
  assert.equal(proof.registryFreshnessVerified,false);
});
test('unsupported malformed registry type, duplicate signer version and duplicate key fingerprint DENY',()=>{
  const f=make();
  f.registry.signers.push({...f.registry.signers[0]});
  f.registryBundle=signEnvelope(f.registry,f.root);
  denied(execute(f),/DUPLICATE_SIGNER_AND_KEY_VERSION/);
  const g=make();
  g.registry.signers.push({...g.registry.signers[0],
    keyVersion:2});
  g.registryBundle=signEnvelope(g.registry,g.root);
  denied(execute(g),/DUPLICATE_SIGNER_FINGERPRINT/);
});
