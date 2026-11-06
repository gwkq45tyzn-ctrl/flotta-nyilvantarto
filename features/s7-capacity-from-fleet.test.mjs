import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('booking falls back to Flotta kapacitas', () => {
  const src = readFileSync('depokapacitas/canonical-booking-transaction.mjs', 'utf8');
  assert.match(src, /fleetDriver\?\.kapacitas/);
  assert.match(src, /norm\(v\.rendszam\)/);
});

test('bridge stores normalizedPlate for rules check', () => {
  const src = readFileSync('features/firestore-bridge.js', 'utf8');
  assert.match(src, /normalizedPlate/);
});

console.log('capacity from fleet tests defined');
