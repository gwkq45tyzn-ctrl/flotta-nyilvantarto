/**
 * Tests for server-only seal.
 * Seal always refused. Parallel privileged orphan cannot authorize seal.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServerOnlySeal} from './v1-server-only-seal.mjs';

test('seal refused without external signer and privileged importer', () => {
  const seal = createServerOnlySeal();
  const result = seal.attemptSeal({masters: 440, claims: 440});
  assert.equal(result.ok, false);
  assert.equal(result.sealed, false);
  assert.equal(result.canSeal, false);
  assert.match(result.reason, /NO_EXTERNAL_SIGNER/);
});

test('even with flags, four scans do not authorize seal', () => {
  const seal = createServerOnlySeal({
    externalSignerAuthenticated: true,
    privilegedImporterVerified: true
  });
  const result = seal.attemptSeal({masters: 440, claims: 440});
  assert.equal(result.ok, false);
  assert.equal(result.sealed, false);
  assert.equal(result.atomicNamespaceSnapshotVerified, false);
  assert.match(result.reason, /NOT_ATOMIC/);
});

test('late privileged orphan after clean scan cannot seal', () => {
  const clean = {masters: 440, claims: 440};
  const withOrphan = {masters: 440, claims: 441};
  const seal = createServerOnlySeal({
    externalSignerAuthenticated: true,
    privilegedImporterVerified: true
  });
  const result = seal.attemptSeal(withOrphan);
  assert.equal(result.ok, false);
  assert.equal(result.sealed, false);
});
