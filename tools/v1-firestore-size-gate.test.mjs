import test from 'node:test';
import assert from 'node:assert/strict';
import {checkSizeGate, generateLargeFixture, CONSERVATIVE_JSON_BUDGET} from './v1-firestore-size-gate.mjs';

test('small fixture is advisory-ok but encoded size unverified',()=>{
  const source = generateLargeFixture(2,2);
  const result = checkSizeGate(source, {});
  assert.equal(result.advisoryOk, true);
  assert.equal(result.firestoreEncodedSizeVerified, false);
  assert.equal(result.authorizedForImport, false);
});

test('oversized JSON budget is rejected',()=>{
  const source = generateLargeFixture(5000,5000);
  const result = checkSizeGate(source, {});
  assert.equal(result.advisoryOk, false);
  assert.match(result.reason, /BUDGET_EXCEEDED/);
  assert.equal(result.authorizedForImport, false);
});

test('conservative budget constant is explicit',()=>{
  assert.equal(CONSERVATIVE_JSON_BUDGET, 800*1024);
});
