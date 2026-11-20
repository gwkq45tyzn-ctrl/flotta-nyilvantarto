import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('capacity rule does not require drivers mirror', () => {
  const rules = readFileSync('depokapacitas/firestore-v1-restricted.rules', 'utf8');
  const cap = rules.split('match /driverCapacities/')[1].split('match /')[0];
  assert.doesNotMatch(cap, /exists\(.*\/drivers\//);
});

test('vehicle mirror writes closed after import', () => {
  const rules = readFileSync('depokapacitas/firestore-v1-restricted.rules', 'utf8');
  assert.match(rules, /after import, vehicle mirrors are not writable/);
});

test('bridge stores normalizedPlate', () => {
  const src = readFileSync('features/firestore-bridge.js', 'utf8');
  assert.match(src, /normalizedPlate/);
});

test('booking normalizes plate for index lookup', () => {
  const src = readFileSync('depokapacitas/canonical-booking-transaction.mjs', 'utf8');
  assert.match(src, /norm\(v\.rendszam\)/);
});

console.log('capacity and normalize tests defined');
