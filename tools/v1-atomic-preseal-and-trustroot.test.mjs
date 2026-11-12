/**
 * Tests for atomic pre-seal inventory and trust-root bootstrap.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createAtomicPresealInventory} from './v1-atomic-preseal-inventory.mjs';
import {createTrustRootBootstrap} from './v1-trust-root-bootstrap.mjs';

test('pre-seal inventory refuses seal without external trust root', () => {
  const inv = createAtomicPresealInventory();
  const result = inv.check({}, 0);
  assert.equal(result.ok, false);
  assert.equal(result.canSeal, false);
  assert.equal(result.atomicNamespaceSnapshotVerified, false);
  assert.match(result.reason, /NO_EXTERNAL_TRUST_ROOT/);
});

test('even with flag, four scans are not treated as atomic', () => {
  const inv = createAtomicPresealInventory({trustRootAuthenticated: true});
  const result = inv.check({}, 440);
  assert.equal(result.ok, false);
  assert.equal(result.atomicNamespaceSnapshotVerified, false);
  assert.match(result.reason, /NOT_ATOMIC/);
});

test('caller-supplied key is rejected', () => {
  const root = createTrustRootBootstrap({pinnedPublicKey: 'pinned-test-key'});
  const result = root.verify('attacker-key');
  assert.equal(result.ok, false);
  assert.match(result.reason, /CALLER_SUPPLIED_KEY_MISMATCH/);
});

test('revoked key is denied', () => {
  const root = createTrustRootBootstrap({pinnedPublicKey: 'pinned-test-key', revoked: true});
  const result = root.verify('pinned-test-key');
  assert.equal(result.ok, false);
  assert.match(result.reason, /KEY_REVOKED/);
});

test('matching pinned key allows dry verification but never seals', () => {
  const root = createTrustRootBootstrap({pinnedPublicKey: 'pinned-test-key'});
  const result = root.verify('pinned-test-key');
  assert.equal(result.ok, true);
  assert.equal(result.sealed, false);
  assert.equal(result.authorizedForImport, false);
  assert.equal(result.externalTrustRootAuthenticityVerified, false);
});
