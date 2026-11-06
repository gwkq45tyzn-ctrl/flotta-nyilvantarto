import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('bridge has no duplicate const projected in the same block', () => {
  const src = readFileSync('features/firestore-bridge.js', 'utf8');
  const matches = src.match(/const projected/g) || [];
  assert.equal(matches.length, 1, 'only one const projected allowed');
});

test('eligibility lists are derived from the actual arrays, not free-form', () => {
  // Documented contract: eligibleDrivers/eligibleVehicles must be computed
  // from the drivers/vehicles arrays in the same payload. A separate list
  // that can be forged independently is not acceptable.
  const src = readFileSync('features/firestore-bridge.js', 'utf8');
  assert.match(src, /eligibleDrivers: projected\.drivers/);
  assert.match(src, /eligibleVehicles: projected\.vehicles/);
});

console.log('syntax and eligibility tests defined');
