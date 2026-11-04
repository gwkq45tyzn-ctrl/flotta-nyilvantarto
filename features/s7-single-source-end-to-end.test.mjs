import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('rules check raw rendszam via getAfter, not forgeable normalizedPlate', () => {
  const rules = readFileSync('depokapacitas/firestore-v1-restricted.rules', 'utf8');
  assert.match(rules, /getAfter\(.*flottaSharedState\/current\).*vehicles\[.*\]\.rendszam/);
  assert.doesNotMatch(rules, /normalizedPlate/);
});

test('booking gate does not require depot mirrors', () => {
  const src = readFileSync('depokapacitas/canonical-booking-gate.mjs', 'utf8');
  assert.doesNotMatch(src, /driver_depot_projection_drift/);
  assert.doesNotMatch(src, /vehicle_depot_projection_drift/);
  assert.match(src, /ineligible_fleet_master/);
});

test('source health does not require mirror parity', () => {
  const src = readFileSync('depokapacitas/canonical-source-health.mjs', 'utf8');
  assert.doesNotMatch(src, /depot_mirror_drift/);
});

test('bridge does not write mirrors', () => {
  const src = readFileSync('features/firestore-bridge.js', 'utf8');
  assert.doesNotMatch(src, /tx\.set\(db\.doc\('drivers\//);
  assert.doesNotMatch(src, /tx\.set\(db\.doc\('vehicles\//);
});

console.log('single source end-to-end tests defined');
