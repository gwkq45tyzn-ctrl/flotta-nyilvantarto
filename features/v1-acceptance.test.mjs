import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const bridge = readFileSync('features/firestore-bridge.js', 'utf8');
const rules = readFileSync('depokapacitas/firestore-v1-restricted.rules', 'utf8');
const booking = readFileSync('depokapacitas/canonical-booking-transaction.mjs', 'utf8');

test('A1: bridge stores normalizedPlate for rules check', () => {
  assert.match(bridge, /normalizedPlate/);
});

test('A2: booking normalizes plate for index lookup', () => {
  assert.match(booking, /norm\(v\.rendszam\)/);
});

test('A3: booking falls back to Flotta kapacitas', () => {
  assert.match(booking, /fleetDriver\?\.kapacitas/);
});

test('A4: booking rule does not require mirror existence', () => {
  const section = rules.split('match /bookings/')[1].split('match /')[0];
  assert.doesNotMatch(section, /get\(.*\/vehicles\/.*\)\.data\.status/);
  assert.doesNotMatch(section, /get\(.*\/drivers\/.*\)\.data\.active/);
});

test('A5: capacity rule does not require drivers mirror', () => {
  const section = rules.split('match /driverCapacities/')[1].split('match /')[0];
  assert.doesNotMatch(section, /exists\(.*\/drivers\//);
});

test('A6: mirror writes closed after import', () => {
  assert.match(rules, /after import, mirrors are not writable/);
  assert.match(rules, /after import, vehicle mirrors are not writable/);
});

test('A7: rules use getAfter for Flotta eligibility', () => {
  assert.match(rules, /getAfter\(.*flottaSharedState\/current\).*drivers\[/);
  assert.match(rules, /getAfter\(.*flottaSharedState\/current\).*vehicles\[/);
});

test('A8: bridge has no duplicate const projected', () => {
  assert.equal((bridge.match(/const projected/g) || []).length, 1);
});

test('A9: bridge does not write mirrors', () => {
  assert.doesNotMatch(bridge, /tx\.set\(db\.doc\('drivers\//);
  assert.doesNotMatch(bridge, /tx\.set\(db\.doc\('vehicles\//);
});

test('A10: migrationSourceSha256 is preserved', () => {
  assert.match(bridge, /migrationSourceSha256/);
});

console.log('V1 acceptance contract tests defined');
