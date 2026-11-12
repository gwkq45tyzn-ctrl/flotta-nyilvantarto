import test from 'node:test';
import assert from 'node:assert/strict';
import {createDurableRegistryAntirollback} from './v1-durable-registry-antirollback.mjs';
const denied=(r,re)=>{
  assert.equal(r.ok,false,JSON.stringify(r));
  assert.equal(r.sealed,false);
  assert.equal(r.canSeal,false);
  assert.equal(r.authorizedForImport,false);
  assert.equal(r.productionIamVerified,false);
  assert.equal(r.externallyAuthenticatedDurableHighWaterVerified,false);
  if(re)assert.match(r.reason,re);
};
test('without actual authenticated durable highwater never grants authority',()=>{
  denied(createDurableRegistryAntirollback().check(5),
    /NO_EXTERNAL_AUTHENTICATED_DURABLE_HIGHWATER/);
});
test('numeric high-water 10 from caller is not a Firestore persisted or owner-authorized proof',()=>{
  const g=createDurableRegistryAntirollback({externalHighWater:10});
  denied(g.check(9),/CALLER_SUPPLIED_HIGHWATER_IS_NOT_DURABLE_PROOF/);
  denied(g.check(10),/CALLER_SUPPLIED_HIGHWATER_IS_NOT_DURABLE_PROOF/);
  denied(g.check(999),/CALLER_SUPPLIED_HIGHWATER_IS_NOT_DURABLE_PROOF/);
});
test('attacker can choose zero high-water, but cannot turn it into authorization',()=>{
  const g=createDurableRegistryAntirollback({externalHighWater:0});
  denied(g.check(1),/CALLER_SUPPLIED_HIGHWATER_IS_NOT_DURABLE_PROOF/);
});
test('malformed registry sequences and bad options fail closed',()=>{
  for(const s of [-1,0,NaN,Infinity,'2',null,{},1.5])
    denied(createDurableRegistryAntirollback().check(s),/INVALID_SIGNED_REGISTRY_SEQUENCE/);
  assert.throws(()=>createDurableRegistryAntirollback(null),/INVALID_UNTRUSTED/);
});
test('seal is never available in offline or demo highwater contract',async()=>{
  denied(await createDurableRegistryAntirollback({
    externalHighWater:2
  }).seal(),/PRODUCTION_SEAL_UNAVAILABLE/);
});
