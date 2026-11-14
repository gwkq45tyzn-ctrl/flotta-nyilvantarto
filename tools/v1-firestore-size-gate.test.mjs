import test from 'node:test';
import assert from 'node:assert/strict';
import {
  checkSizeGate,generateLargeFixture,CONSERVATIVE_JSON_BUDGET,
  estimateFirestoreDocumentStorageBytes
} from './v1-firestore-size-gate.mjs';

test('official Standard Firestore storage size example is 147 bytes (NOT wire encoding)',()=>{
  const example={type:'Personal',done:false,priority:1,
    description:'Learn Cloud Firestore'};
  assert.equal(estimateFirestoreDocumentStorageBytes(
    example,'users/jeff/tasks/my_task_id'),147);
});
test('small full-rich source is advisory OK, but import DENIED until encoded proof',()=>{
  const raw=generateLargeFixture(2,2);
  const o=checkSizeGate(raw,{'flottaDrivers/DA0001':
    {daCode:'DA0001',kapacitas:60,history:[{e:'start'}]}});
  assert.equal(o.advisoryOk,true,JSON.stringify(o));
  assert.ok(o.sourceStorageEstimateBytes>0);
  assert.ok(o.maxKeyedStorageEstimateBytes>0);
  assert.equal(o.firestoreEncodedSizeVerified,false);
  assert.equal(o.authorizedForImport,false);
});
test('oversized strict JSON source refuses before any privileged import',()=>{
  const o=checkSizeGate(generateLargeFixture(5000,5000),{});
  assert.equal(o.advisoryOk,false);
  assert.match(o.reason,/BUDGET_EXCEEDED/);
  assert.equal(o.authorizedForImport,false);
});
test('Firestore field name more than 1500 UTF8 bytes DENY, despite small source JSON',()=>{
  const raw={drivers:[],vehicles:[],fuelCards:[],contacts:[],
    ['á'.repeat(800)]:true};
  const o=checkSizeGate(raw,{});
  assert.equal(o.advisoryOk,false);
  assert.match(o.reason,/FIRESTORE_FIELD_NAME_INVALID/);
});
test('Firestore depth greater than 20 DENY',()=>{
  let nested={leaf:'v'};
  for(let i=0;i<21;i++)nested={nested};
  const o=checkSizeGate({...generateLargeFixture(0,0),extra:nested},{});
  assert.equal(o.advisoryOk,false);
  assert.match(o.reason,/FIRESTORE_FIELD_DEPTH_EXCEEDED/);
});
test('undefined, non-finite and cyclic JSON sources DENY (not silently dropped)',()=>{
  const raw=generateLargeFixture(1,1);
  raw.extra={bad:undefined};
  assert.equal(checkSizeGate(raw,{}).advisoryOk,false);
  raw.extra={bad:Infinity};
  assert.equal(checkSizeGate(raw,{}).advisoryOk,false);
  const circular={};circular.self=circular;raw.extra=circular;
  assert.equal(checkSizeGate(raw,{}).advisoryOk,false);
});
test('invalid or missing keyed path is refused, never counted as harmless data',()=>{
  const raw=generateLargeFixture(1,1);
  const o=checkSizeGate(raw,{DA0001:{daCode:'DA0001'}});
  assert.equal(o.advisoryOk,false);
  assert.match(o.reason,/INVALID_KEYED_DOCUMENT_PATH/);
});
test('identity claim paths are measured and still not import authority',()=>{
  const raw=generateLargeFixture(1,1);
  const claim={sourceIndex:0,revision:1,note:'árvíztűrő',
    history:[{text:'második',nested:{keep:true}}]};
  const o=checkSizeGate(raw,{
    'flottaDriverClaims/DA0001':claim,
    'flottaVehicleClaims/PLATE0001':{sourceIndex:0,revision:1}
  });
  assert.equal(o.advisoryOk,true,JSON.stringify(o));
  assert.ok(o.keyedStorageEstimates['flottaDriverClaims/DA0001']>0);
  assert.ok(o.keyedStorageEstimates['flottaVehicleClaims/PLATE0001']>0);
  assert.equal(o.firestoreEncodedSizeVerified,false);
  assert.equal(o.authorizedForImport,false);
});
test('multibyte nested history uses UTF-8 bytes, not character length',()=>{
  const ascii=estimateFirestoreDocumentStorageBytes(
    {history:[{text:'e'}]},'flottaDrivers/DA0001');
  const multi=estimateFirestoreDocumentStorageBytes(
    {history:[{text:'é'}]},'flottaDrivers/DA0001');
  assert.equal(multi-ascii,1);
  const archive=checkSizeGate({
    drivers:[{id:'d',daCode:'DA0001',history:[{text:'árvíztűrő'}]}],
    vehicles:[],fuelCards:[],contacts:[]
  },{});
  assert.equal(archive.advisoryOk,true,JSON.stringify(archive));
  assert.equal(archive.firestoreEncodedSizeVerified,false);
  assert.ok(archive.sourceStorageEstimateBytes>archive.sourceJsonBytes);
});
test('oversized multibyte field is denied before any write and is not encoded proof',()=>{
  const raw=generateLargeFixture(0,0);
  raw.historyNote='é'.repeat(700000);
  const o=checkSizeGate(raw,{});
  assert.equal(o.advisoryOk,false);
  assert.match(o.reason,/FIRESTORE_FIELD_VALUE_LIMIT_EXCEEDED|BUDGET_EXCEEDED/);
  assert.equal(o.firestoreEncodedSizeVerified,false);
  assert.equal(o.authorizedForImport,false);
});
test('even when all size calculations succeed, cannot promote estimated bytes to authority',()=>{
  const raw=generateLargeFixture(1,1);
  const o=checkSizeGate(raw,{});
  assert.equal(o.firestoreEncodedSizeVerified,false);
  assert.equal(o.authorizedForImport,false);
  assert.match(o.reason,/ADVISORY_ONLY/);
  assert.equal(CONSERVATIVE_JSON_BUDGET,800*1024);
});

test('quoted UTF-8 field paths, malformed UTF-16 and directly nested arrays fail before writes',()=>{
  const raw=generateLargeFixture(0,0);
  const check=extra=>checkSizeGate({...raw,extra},{}).reason;
  assert.match(check({['x`'.repeat(500)]:1}),/FIELD_PATH_LIMIT/);
  assert.match(check({note:'\ud800'}),/INVALID_FIRESTORE_UTF8/);
  assert.match(check([['x']]),/FIRESTORE_NESTED_ARRAY/);
  assert.equal(checkSizeGate({...raw,extra:[{items:['árvíz']}]},{}).advisoryOk,true);
});
