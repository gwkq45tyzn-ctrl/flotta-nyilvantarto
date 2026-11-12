import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,createHash} from 'node:crypto';
import {createAtomicPresealInventory} from './v1-atomic-preseal-inventory.mjs';
import {createTrustRootBootstrap} from './v1-trust-root-bootstrap.mjs';
const makeKey=()=>{
  const kp=generateKeyPairSync('ed25519');
  const der=kp.publicKey.export({type:'spki',format:'der'});
  return {
    publicKeySpkiBase64:der.toString('base64'),
    fingerprint:createHash('sha256').update(der).digest('hex')
  };
};
const config=(key=makeKey())=>({
  trustedPublicKeySpkiBase64:key.publicKeySpkiBase64,
  independentlyPinnedPublicKeySha256:key.fingerprint,
  registryVersion:1,validFromMs:Date.now()-50000,
  expiresAtMs:Date.now()+3600000,revokedFingerprints:[]
});
function deny(result,reason){
  assert.equal(result.ok,false,JSON.stringify(result));
  assert.equal(result.canSeal,false);
  assert.equal(result.sealed,false);
  assert.equal(result.authorizedForImport,false);
  assert.equal(result.productionIamVerified,false);
  if(reason)assert.match(result.reason,reason);
}
test('no external root is fail-closed rather than inventing an owner key',()=>{
  deny(createTrustRootBootstrap().verify(makeKey().publicKeySpkiBase64),
    /NO_INDEPENDENTLY_CONFIGURED_PUBLIC_ROOT/);
});
test('real Ed25519 public key + independently pinned DER fingerprint matches local registry only',()=>{
  const key=makeKey(),bootstrap=createTrustRootBootstrap(config(key));
  const r=bootstrap.verify(key.publicKeySpkiBase64);
  assert.equal(r.ok,true,JSON.stringify(r));
  assert.equal(r.fingerprint,key.fingerprint);
  assert.equal(r.registryVersion,1);
  assert.equal(r.externalTrustRootAuthenticityVerified,false);
  assert.equal(r.revocationFreshnessVerified,false);
  assert.equal(r.trustedClockVerified,false);
  assert.equal(r.signatureIntegrityVerified,false);
  assert.equal(r.ownerApprovalAuthenticated,false);
  assert.equal(r.productionIamVerified,false);
  assert.equal(r.canSeal,false);
});
test('actual alternative Ed25519 public key cannot replace pinned identity',()=>{
  const a=makeKey(),b=makeKey(),root=createTrustRootBootstrap(config(a));
  deny(root.verify(b.publicKeySpkiBase64),/PIN_MISMATCH/);
});
test('caller cannot backdate expiry, override pin or inject fake authority',()=>{
  const key=makeKey(),root=createTrustRootBootstrap({
    ...config(key),expiresAtMs:Date.now()-1,
    validFromMs:Date.now()-10000
  });
  deny(root.verify(key.publicKeySpkiBase64),/ROOT_EXPIRED/);
  for(const args of [0,1,Date.now()-1234,{now:0},{now:0,revoked:false},null]){
    deny(root.verify(key.publicKeySpkiBase64,args),
      /CALLER_SUPPLIED_CLOCK_OR_AUTHORITY_DENIED/);
  }
});
test('key expiration and not-before window checked with internal local clock, no caller time',()=>{
  const key=makeKey();
  deny(createTrustRootBootstrap({
    ...config(key),validFromMs:Date.now()-10000,
    expiresAtMs:Date.now()-1
  }).verify(key.publicKeySpkiBase64),/ROOT_EXPIRED/);
  deny(createTrustRootBootstrap({
    ...config(key),validFromMs:Date.now()+10000,
    expiresAtMs:Date.now()+20000
  }).verify(key.publicKeySpkiBase64),/ROOT_NOT_YET_VALID/);
});
test('revoked fingerprint from configured offline revocation list DENIED',()=>{
  const key=makeKey();
  const root=createTrustRootBootstrap({
    ...config(key),revokedFingerprints:[key.fingerprint]
  });
  deny(root.verify(key.publicKeySpkiBase64),/ROOT_REVOKED/);
});
test('invalid/unknown root identity, unsupported encoding or non-Ed25519 key denied',()=>{
  const key=makeKey();
  assert.throws(()=>createTrustRootBootstrap({
    ...config(key),trustedPublicKeySpkiBase64:'pinned-test-key'
  }),/INVALID_TRUST_ROOT_KEY/);
  assert.throws(()=>createTrustRootBootstrap({
    ...config(key),independentlyPinnedPublicKeySha256:'f'.repeat(64)
  }),/TRUST_ROOT_PIN_MISMATCH/);
  assert.throws(()=>createTrustRootBootstrap({
    ...config(key),registryVersion:'1'
  }),/PINNED_REGISTRY_VERSION_REQUIRED/);
  assert.throws(()=>createTrustRootBootstrap({
    ...config(key),expiresAtMs:null
  }),/VALIDITY_WINDOW_REQUIRED/);
  assert.throws(()=>createTrustRootBootstrap({
    ...config(key),revokedFingerprints:[key.fingerprint,key.fingerprint]
  }),/MALFORMED_OFFLINE_REVOCATION_SET/);
  assert.throws(()=>createTrustRootBootstrap({
    ...config(key),manualApproval:true
  }),/UNTRUSTED_ROOT_CONFIG_OVERRIDE/);
});
test('malformed candidate public key denied, no raw-text public root equality',()=>{
  const key=makeKey(),root=createTrustRootBootstrap(config(key));
  for(const v of ['pinned-test-key','',null,{},key.fingerprint])
    deny(root.verify(v),/INVALID_CANDIDATE_ED25519_KEY/);
});
test('candidate cannot modify frozen pinned registry through instance props',()=>{
  const key=makeKey(),other=makeKey(),root=createTrustRootBootstrap(config(key));
  root.trustedPublicKeySpkiBase64=other.publicKeySpkiBase64;
  root.independentlyPinnedPublicKeySha256=other.fingerprint;
  root.revokedFingerprints=[];
  deny(root.verify(other.publicKeySpkiBase64),/PIN_MISMATCH/);
  assert.equal(root.verify(key.publicKeySpkiBase64).ok,true);
});
test('root matching only with self-chosen caller fingerprint does NOT prove external owner authority',()=>{
  // This is an explicit counterexample: attacker can invent a complete
  // self-consistent test root. It is never production provenance.
  const attacker=makeKey();
  const forged=createTrustRootBootstrap(config(attacker));
  const result=forged.verify(attacker.publicKeySpkiBase64);
  assert.equal(result.ok,true);
  assert.equal(result.externalTrustRootAuthenticityVerified,false);
  assert.equal(result.authorizedForImport,false);
  assert.equal(result.signatureIntegrityVerified,false);
  assert.equal(result.canSeal,false);
});
test('Grok legacy boolean trustRootAuthenticated and fake observed count never authorize seal',async()=>{
  const pre=createAtomicPresealInventory({trustRootAuthenticated:true});
  const result=pre.check({ok:true,sourceSha256:'f'.repeat(64),
    atomicNamespaceSnapshotVerified:true,issues:[]},440);
  deny(result,/UNTRUSTED_OR_NONATOMIC_CLIENT_OBSERVATION/);
  assert.equal(result.atomicNamespaceSnapshotVerified,false);
  assert.equal(result.externalTrustRootAuthenticityVerified,false);
  deny(await pre.seal(),/SEAL_DENIED/);
});
test('non-atomic four collections cannot be transformed into a seal via self asserted count',()=>{
  const pre=createAtomicPresealInventory();
  for(const [obs,count] of [
    [{},0],[{},440],[{masters:{},claims:{}},0],
    [{canSeal:true,authorizedForImport:true},440]
  ])deny(pre.check(obs,count),/NONATOMIC/);
});
