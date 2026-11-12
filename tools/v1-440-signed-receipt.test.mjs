/**
 * Tests for bounded 440 signed receipt.
 * Without external isolation, always DENY. Never seals.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createBoundedSignedReceipt} from './v1-440-signed-receipt.mjs';

test('no external privileged isolation always denies for 440', () => {
  const receipt = createBoundedSignedReceipt();
  const result = receipt.check(440);
  assert.equal(result.ok, false);
  assert.equal(result.sealed, false);
  assert.equal(result.canSeal, false);
  assert.match(result.reason, /NO_EXTERNAL_PRIVILEGED_ISOLATION/);
});

test('even with flag, privileged bypass can reset receipt', () => {
  const receipt = createBoundedSignedReceipt({externalPrivilegedIsolationVerified: true});
  const result = receipt.check(440);
  assert.equal(result.ok, false);
  assert.equal(result.sealed, false);
  assert.match(result.reason, /PRIVILEGED_BYPASS/);
});

test('exceeds 440 limit is denied', () => {
  const receipt = createBoundedSignedReceipt();
  const result = receipt.check(441);
  assert.equal(result.ok, false);
  assert.match(result.reason, /EXCEEDS_440_LIMIT/);
});
