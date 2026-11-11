/**
 * #185 boundary tests: estimator fails closed on oversized and invalid inputs.
 * Never sets authorizedForImport true.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {sizeGate, estimateStorageSize} from './v1-firestore-size-estimator.mjs';

test('valid small document returns advisory size but never authorizes',()=>{
  const data = {id:'ok',value:1};
  const size = estimateStorageSize('col/doc', data);
  assert.ok(typeof size === 'number' && size > 0);
  const gate = sizeGate(data, {'col/doc': data});
  assert.equal(gate.ok, false);
  assert.equal(gate.authorizedForImport, false);
  assert.equal(gate.firestoreEncodedSizeVerified, false);
});

test('oversized or invalid returns null / deny',()=>{
  const huge = {text: 'x'.repeat(2_000_000)};
  assert.equal(estimateStorageSize('col/doc', huge), null);
  const gate = sizeGate(huge, {});
  assert.equal(gate.ok, false);
  assert.match(gate.reason || '', /SIZE|INVALID/);
});

test('depth or non-plain object fails closed',()=>{
  const deep = {a:{b:{c:{d:{e:{f:{g:{h:{i:{j:{k:{l:{m:{n:{o:{p:{q:{r:{s:{t:{u:{v:1}}}}}}}}}}}}}}}}}}}}};
  assert.equal(estimateStorageSize('col/doc', deep), null);
});
