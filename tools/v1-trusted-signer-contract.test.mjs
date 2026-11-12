/**
 * Tests for the trusted signer contract.
 * Without external registry, always NO-AUTHORITY. Seal never granted.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createTrustedSignerContract} from './v1-trusted-signer-contract.mjs';

test('no external registry entry always denies', () => {
  const contract = createTrustedSignerContract();
  const result = contract.verify({signerId: 'self-selected'});
  assert.equal(result.ok, false);
  assert.equal(result.sealed, false);
  assert.equal(result.canSeal, false);
  assert.match(result.reason, /NO_EXTERNAL_OWNER_REGISTRY/);
});

test('caller-selected signer id is rejected', () => {
  const contract = createTrustedSignerContract({
    externalRegistryEntry: {signerId: 'owner-registered'}
  });
  const result = contract.verify({signerId: 'attacker'});
  assert.equal(result.ok, false);
  assert.equal(result.canSeal, false);
  assert.match(result.reason, /SIGNER_ID_MISMATCH/);
});

test('matching external registry allows dry verification but never seals', () => {
  const contract = createTrustedSignerContract({
    externalRegistryEntry: {signerId: 'owner-registered'}
  });
  const result = contract.verify({signerId: 'owner-registered'});
  assert.equal(result.ok, true);
  assert.equal(result.sealed, false);
  assert.equal(result.canSeal, false);
  assert.equal(result.authorizedForImport, false);
  assert.equal(result.externalTrustRootAuthenticityVerified, false);
});
