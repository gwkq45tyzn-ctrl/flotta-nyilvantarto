/**
 * Tests for the server seal boundary.
 * Seal always refused. Four scans are never treated as atomic.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServerSealBoundary} from './v1-server-seal-boundary.mjs';

test('seal refused without external trust root and privileged importer', () => {
  const boundary = createServerSealBoundary();
  const result = boundary.attemptSeal({masters: 440, claims: 440});
  assert.equal(result.ok, false);
  assert.equal(result.canSeal, false);
  assert.equal(result.atomicNamespaceSnapshotVerified, false);
  assert.match(result.reason, /NO_EXTERNAL_TRUST_ROOT/);
});

test('even with flags, four scans do not authorize seal', () => {
  const boundary = createServerSealBoundary({
    externalTrustRootAuthenticated: true,
    privilegedImporterVerified: true
  });
  const result = boundary.attemptSeal({masters: 440, claims: 440});
  assert.equal(result.ok, false);
  assert.equal(result.canSeal, false);
  assert.equal(result.atomicNamespaceSnapshotVerified, false);
  assert.match(result.reason, /NOT_ATOMIC/);
});

test('parallel privileged orphan after scan cannot be silently sealed', () => {
  const earlierScan = {masters: 440, claims: 440, ok: true};
  const laterOrphan = {masters: 440, claims: 441};
  const boundary = createServerSealBoundary({
    externalTrustRootAuthenticated: true,
    privilegedImporterVerified: true
  });
  const result = boundary.attemptSeal(laterOrphan);
  assert.equal(result.ok, false);
  assert.equal(result.canSeal, false);
});
