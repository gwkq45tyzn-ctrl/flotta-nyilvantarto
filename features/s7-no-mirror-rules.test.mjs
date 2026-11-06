import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('booking rule does not require mirror existence', () => {
  const rules = readFileSync('depokapacitas/firestore-v1-restricted.rules', 'utf8');
  const booking = rules.split('match /bookings/')[1].split('match /')[0];
  assert.doesNotMatch(booking, /get\(.*\/vehicles\/.*\)\.data\.status/);
  assert.doesNotMatch(booking, /get\(.*\/drivers\/.*\)\.data\.active/);
});

test('mirror writes closed after import', () => {
  const rules = readFileSync('depokapacitas/firestore-v1-restricted.rules', 'utf8');
  assert.match(rules, /after import, mirrors are not writable/);
});

test('booking uses raw rendszam', () => {
  const src = readFileSync('depokapacitas/canonical-booking-transaction.mjs', 'utf8');
  assert.match(src, /String\(v\.rendszam\|\|''\)===vehicleId/);
});

console.log('no-mirror rules tests defined');
