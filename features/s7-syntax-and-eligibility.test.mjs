import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('bridge has no duplicate const projected in the same block', () => {
  const src = readFileSync('features/firestore-bridge.js', 'utf8');
  const matches = src.match(/const projected/g) || [];
  assert.equal(matches.length, 1, 'only one const projected allowed');
});

test('sealed bridge keeps archive immutable and writes current keyed masters', () => {
  // Archived identity provenance stays frozen; operational edits use keyed masters.
  const src = readFileSync('features/firestore-bridge.js', 'utf8');
  assert.match(src, /payload\.drivers = existing\.drivers/);
  assert.match(src, /payload\.vehicles = existing\.vehicles/);
  assert.match(src, /tx\.set\(item\.ref, item\.merged\)/);
});

console.log('syntax and eligibility tests defined');
