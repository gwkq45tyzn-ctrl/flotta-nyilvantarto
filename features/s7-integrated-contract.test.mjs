import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('bridge has no duplicate const projected', () => {
  const src = readFileSync('features/firestore-bridge.js', 'utf8');
  assert.equal((src.match(/const projected/g) || []).length, 1);
});

test('booking rule verifies against actual Flotta arrays', () => {
  const rules = readFileSync('depokapacitas/firestore-v1-restricted.rules', 'utf8');
  assert.match(rules, /drivers\[request\.resource\.data\.driverIndex\]\.daCode/);
  assert.match(rules, /vehicles\[request\.resource\.data\.vehicleIndex\]\.normalizedPlate/);
  assert.doesNotMatch(rules, /eligibleDrivers/);
});

test('booking transaction supplies indices', () => {
  const src = readFileSync('depokapacitas/canonical-booking-transaction.mjs', 'utf8');
  assert.match(src, /driverIndex/);
  assert.match(src, /vehicleIndex/);
});

console.log('integrated contract tests defined');
