/**
 * Tests for privileged isolation model.
 * Without external IAM, always DENY. Never seals.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createPrivilegedIsolationModel} from './v1-privileged-isolation-model.mjs';

test('no external IAM isolation always denies', () => {
  const model = createPrivilegedIsolationModel();
  const result = model.check('a'.repeat(64));
  assert.equal(result.ok, false);
  assert.equal(result.sealed, false);
  assert.equal(result.canSeal, false);
  assert.equal(result.privilegedWriterIsolationVerified, false);
  assert.match(result.reason, /NO_EXTERNAL_IAM_ISOLATION/);
});

test('even with flag, Admin SDK bypass remains possible', () => {
  const model = createPrivilegedIsolationModel({externalIamIsolationVerified: true});
  const result = model.check('a'.repeat(64));
  assert.equal(result.ok, false);
  assert.equal(result.sealed, false);
  assert.equal(result.canSeal, false);
  assert.match(result.reason, /ADMIN_SDK_BYPASS/);
});
