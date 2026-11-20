import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('rules use getAfter for Flotta eligibility', () => {
  const rules = readFileSync('depokapacitas/firestore-v1-restricted.rules', 'utf8');
  assert.match(rules, /getAfter\(.*flottaSharedState\/current\).*drivers\[/);
  assert.match(rules, /getAfter\(.*flottaSharedState\/current\).*vehicles\[/);
});

test('rules check normalizedPlate', () => {
  const rules = readFileSync('depokapacitas/firestore-v1-restricted.rules', 'utf8');
  assert.match(rules, /normalizedPlate == request\.resource\.data\.vehicleId/);
});

test('bridge stores normalizedPlate and does not write mirrors', () => {
  const src = readFileSync('features/firestore-bridge.js', 'utf8');
  assert.match(src, /normalizedPlate/);
  assert.doesNotMatch(src, /tx\.set\(db\.doc\('drivers\//);
  assert.doesNotMatch(src, /tx\.set\(db\.doc\('vehicles\//);
});

test('plate normalization contract', () => {
  const plate = s => String(s || '').replace(/[\s-]/g, '').toUpperCase();
  assert.equal(plate('ABC-123'), 'ABC123');
  assert.equal(plate('abc 123'), 'ABC123');
  assert.equal(plate('XYZ-9'), 'XYZ9');
});

console.log('normalize and getAfter tests defined');
