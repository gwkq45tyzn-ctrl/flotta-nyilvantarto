import test from 'node:test';
import assert from 'node:assert/strict';
import {createSignedSourceHighwater} from './v1-signed-source-highwater.mjs';

const denied=(r,re)=>{
  assert.equal(r.ok,false,JSON.stringify(r));
  assert.equal(r.sealed,false);
  assert.equal(r.canSeal,false);
  assert.equal(r.authorizedForImport,false);
  assert.equal(r.productionIamVerified,false);
  assert.equal(r.privilegedWriterIsolationVerified,false);
  assert.equal(r.externallyAuthenticatedDurableHighWaterVerified,false);
  if(re)assert.match(r.reason,re);
};
test('self-asserted owner signer/isolation flags never authorize an offline SHA+registry sequence',()=>{
  const g=createSignedSourceHighwater({
    externalPrivilegedIsolationVerified:true,
    ownerApproved:true,externalSignerAuthenticated:true,
    productionIamVerified:true
  });
  denied(g.check('a'.repeat(64),3),/CALLER_PROVIDED_SOURCE_AND_PRIVILEGED_FLAGS_NOT_AUTHORITY/);
  denied(g.check('a'.repeat(64),999),/CALLER_PROVIDED_SOURCE_AND_PRIVILEGED_FLAGS_NOT_AUTHORITY/);
  denied(g.check('f'.repeat(64),1),/CALLER_PROVIDED_SOURCE_AND_PRIVILEGED_FLAGS_NOT_AUTHORITY/);
});
test('missing or malformed hash and registry revision fail-closed',()=>{
  const g=createSignedSourceHighwater();
  for(const [sha,seq] of [
    ['invalid',1],['f'.repeat(64),0],['f'.repeat(64),-2],
    ['f'.repeat(64),1.5],[null,1],['f'.repeat(64),'2']
  ])denied(g.check(sha,seq),/MALFORMED_SOURCE_PIN_OR_REGISTRY_SEQUENCE/);
});
test('fake SDK proof cannot conjure a real emulator or production authority',async()=>{
  const g=createSignedSourceHighwater();
  denied(await g.inspectLocalEmulator({
    config:{projectId:'prod-unauthorized'},
    evidence:{privilegedImporterVerified:true,seal:true}
  }),/LOCAL_EMULATOR_SOURCE_PROOF_ERROR/);
  denied(await g.seal(),/REAL_PRIVILEGED_IAM_AND_OWNER_SEAL_UNAVAILABLE/);
});
