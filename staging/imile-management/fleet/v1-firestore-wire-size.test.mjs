import test from 'node:test';
import assert from 'node:assert/strict';
import {initializeApp} from 'firebase/app';
import {getFirestore} from 'firebase/firestore';
import {measureDocumentSet, MAX_DOCUMENT_PROTO_BYTES} from './v1-firestore-wire-size.mjs';

const db = getFirestore(initializeApp({projectId: 'demo-wire-proof'}));
const name = 'projects/demo-wire-proof/databases/(default)/documents/c/d';

test('real SDK and v1 encoder match independently counted protobuf fields', () => {
  // name tag + one-byte length. For {x:true}, a fields entry adds the map
  // tag+length, key (tag, length, x), and value (tag, length, boolean tag, 1).
  const empty = Buffer.byteLength(name) + 2;
  assert.equal(measureDocumentSet(db, 'c/d', {}), empty);
  assert.equal(measureDocumentSet(db, 'c/d', {x: true}), empty + 9);
  const rich = {list: [{text: 'a', n: -12, f: 0.25, extra: null}]};
  const ascii = measureDocumentSet(db, 'c/d', rich);
  rich.list[0].text = '📦';
  assert.equal(measureDocumentSet(db, 'c/d', rich), ascii + 3);
  assert.equal(measureDocumentSet(db, 'c/longer', rich), ascii + 8);
  assert.throws(() => measureDocumentSet(db, 'c/d', {list: [[1]]}), /nested arrays/i);
});

test('exact Document limit and one extra byte, with two legal-sized fields', () => {
  const data = {a: 'x'.repeat(520000), b: 'x'.repeat(520000)};
  const measured = measureDocumentSet(db, 'c/d', data);
  data.b += 'x'.repeat(MAX_DOCUMENT_PROTO_BYTES - measured);
  assert.equal(measureDocumentSet(db, 'c/d', data), MAX_DOCUMENT_PROTO_BYTES);
  data.b += 'x';
  assert.throws(() => measureDocumentSet(db, 'c/d', data), /FIRESTORE_DOCUMENT_PROTO_LIMIT/);
});


test('actual SDK accepts slash and dot rich field keys unchanged by size preflight', async()=>{
  const {checkSizeGate}=await import('../../../tools/v1-firestore-size-gate.mjs');
  const rich={'vendor/reference':'árvíztűrő','.':{'..':'📦'},'a`b\\c':true};
  const source={drivers:[],vehicles:[],fuelCards:[],contacts:[],extra:rich};
  const before=structuredClone(source);
  assert.ok(measureDocumentSet(db,'c/d',source)>0);
  assert.equal(checkSizeGate(source).advisoryOk,true);
  assert.deepEqual(source,before);
});
