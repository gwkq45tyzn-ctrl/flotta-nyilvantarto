import test from 'node:test';
import assert from 'node:assert/strict';
import {estimateStorageSize,sizeGate} from './v1-firestore-size-estimator.mjs';
import {
  estimateFirestoreDocumentStorageBytes,generateLargeFixture
} from './v1-firestore-size-gate.mjs';
const small=()=>generateLargeFixture(2,2);
test('both estimator API names give exactly the same official 147-byte document',()=>{
  const data={type:'Personal',done:false,priority:1,description:'Learn Cloud Firestore'};
  const path='users/jeff/tasks/my_task_id';
  assert.equal(estimateStorageSize(path,data),147);
  assert.equal(estimateStorageSize(path,data),
    estimateFirestoreDocumentStorageBytes(data,path));
});
test('invalid Firestore document path and unicode field names fail closed',()=>{
  assert.equal(estimateStorageSize('just_collection',{}),null);
  assert.equal(estimateStorageSize('flottaDrivers/DA0001',
    {['á'.repeat(800)]:true}),null);
  assert.equal(estimateStorageSize('flottaDrivers/DA0001',
    {unused:Infinity}),null);
});
test('nested maps, arrays, and real rich fleet documents use one authority',()=>{
  const doc={daCode:'DA0001',sourceIndex:0,history:[
    {type:'first',details:{source:'original',nested:[1,2,3]}}
  ],contact:{active:true,email:'synthetic@example.invalid'}};
  const path='flottaDrivers/DA0001';
  assert.equal(estimateStorageSize(path,doc),
    estimateFirestoreDocumentStorageBytes(doc,path));
});
test('advisory success never becomes an import success boolean',()=>{
  const res=sizeGate(small(),{
    'flottaDrivers/DA0001':{daCode:'DA0001',sourceIndex:0}
  });
  assert.equal(res.advisoryOk,true);
  assert.equal(res.ok,false);
  assert.equal(res.authorizedForImport,false);
  assert.equal(res.firestoreEncodedSizeVerified,false);
  assert.match(res.reason,/ADVISORY_ONLY/);
});
test('malformed and oversized source always block, no permissive fallback',()=>{
  const invalid=small();
  invalid.extra={n:NaN};
  const a=sizeGate(invalid,{});
  assert.equal(a.ok,false);
  assert.equal(a.advisoryOk,false);
  assert.equal(a.authorizedForImport,false);
  const b=sizeGate(generateLargeFixture(5000,5000),{});
  assert.equal(b.ok,false);
  assert.equal(b.advisoryOk,false);
  assert.match(b.reason,/BUDGET_EXCEEDED/);
});
