/**
 * Tests for signed-source highwater binding.
 * Without external isolation, always DENY. Never seals.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createSignedSourceHighwater} from './v1-signed-source-highwater.mjs';

test('no external privileged isolation always denies', () => {
  const guard = createSignedSourceHighwater();
  const result = guard.check('a'.repeat(64), 3);
  assert.equal(result.ok, false);
  assert.equal(result.sealed, false);
  assert.equal(result.canSeal, false);
  assert.equal(result.privilegedWriterIsolationVerified, false);
  assert.match(result.reason, /NO_EXTERNAL_PRIVILEGED_ISOLATION/);
});

test('even with flag, privileged bypass can reset highwater', () => {
  const guard = createSignedSourceHighwater({externalPrivilegedIsolationVerified: true});
  const result = guard.check('a'.repeat(64), 3);
  assert.equal(result.ok, false);
  assert.equal(result.sealed, false);
  assert.equal(result.canSeal, false);
  assert.match(result.reason, /PRIVILEGED_BYPASS/);
});
