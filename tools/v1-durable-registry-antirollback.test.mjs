/**
 * Tests for durable registry antirollback.
 * Without external high-water, always DENY. Stale sequence rejected. Never seals.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createDurableRegistryAntirollback} from './v1-durable-registry-antirollback.mjs';

test('no external high-water always denies', () => {
  const guard = createDurableRegistryAntirollback();
  const result = guard.check(5);
  assert.equal(result.ok, false);
  assert.equal(result.sealed, false);
  assert.equal(result.canSeal, false);
  assert.match(result.reason, /NO_EXTERNAL_DURABLE_HIGH_WATER/);
});

test('stale registry sequence is rejected', () => {
  const guard = createDurableRegistryAntirollback({externalHighWater: 10});
  const result = guard.check(9);
  assert.equal(result.ok, false);
  assert.equal(result.canSeal, false);
  assert.match(result.reason, /STALE_REGISTRY_SEQUENCE/);
});

test('sequence at or above high-water allows dry check but never seals', () => {
  const guard = createDurableRegistryAntirollback({externalHighWater: 10});
  const result = guard.check(10);
  assert.equal(result.ok, true);
  assert.equal(result.sealed, false);
  assert.equal(result.canSeal, false);
  assert.equal(result.authorizedForImport, false);
  assert.equal(result.productionIamVerified, false);
});
