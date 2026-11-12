import test from 'node:test';
import assert from 'node:assert/strict';
import {createBoundedSignedReceipt} from './v1-440-signed-receipt.mjs';
const denied=(r,pattern)=>{
  assert.equal(r.ok,false,JSON.stringify(r));
  assert.equal(r.sealed,false);
  assert.equal(r.canSeal,false);
  assert.equal(r.authorizedForImport,false);
  assert.equal(r.productionIamVerified,false);
  assert.equal(r.privilegedWriterIsolationVerified,false);
  if(pattern)assert.match(r.reason,pattern);
};
test('440 is exactly 19 bounded 24-pair chunks but no source/owner proof',()=>{
  const r=createBoundedSignedReceipt().check(440);
  denied(r,/UNTRUSTED_COUNT_OR_ISOLATION_FLAG/);
  assert.equal(r.expectedChunks,19);
});
test('self-reported external isolation, signer and forged manifest cannot elevate 440 count',()=>{
  const g=createBoundedSignedReceipt({
    externalPrivilegedIsolationVerified:true,
    externalSignerAuthenticated:true,ownerApproved:true
  });
  denied(g.check(440),/UNTRUSTED_COUNT_OR_ISOLATION_FLAG/);
  denied(g.check(24),/UNTRUSTED_COUNT_OR_ISOLATION_FLAG/);
});
test('negative source counts, fractions, 441 and illegal oversized chunk fail',()=>{
  const g=createBoundedSignedReceipt();
  for(const n of [-1,0,1.5,null,NaN,Infinity,'440'])
    denied(g.check(n),/INVALID_RICH_PAIR_COUNT/);
  denied(g.check(441),/EXCEEDS_440_LIMIT/);
  for(const chunk of [0,25,1.5,'24'])
    denied(g.check(440,chunk),/INVALID_CHUNK_SIZE_MAX_24/);
});
test('no fake non-demo Firestore import or seal can be accepted',async()=>{
  const g=createBoundedSignedReceipt();
  denied(await g.inspectLocalDemoChunk({projectId:'prod-company'},{
    externalPrivilegedIsolationVerified:true,authorizedForImport:true
  },0),/LOCAL_EMULATOR_440_CHUNK_FAILED/);
  denied(await g.seal(),/NO_PRIVILEGED_WRITER_ISOLATION/);
});
