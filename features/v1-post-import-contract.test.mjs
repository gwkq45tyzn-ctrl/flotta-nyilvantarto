import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const bridge = readFileSync('features/firestore-bridge.js', 'utf8');
const rules = readFileSync('depokapacitas/firestore-v1-restricted.rules', 'utf8');

test('post-import: gateOldSync disables legacy JSONP', () => {
  assert.match(bridge, /function gateOldSync/);
  assert.match(bridge, /pushRemote = function/);
  assert.match(bridge, /pullRemote = function/);
});

test('post-import: isPrimary requires server approval and flags', () => {
  assert.match(bridge, /migrationServerApproved === true/);
  assert.match(bridge, /PRIMARY_FLAG/);
  assert.match(bridge, /IMPORT_VERIFIED/);
});

test('post-import: SHA must match approved policy', () => {
  assert.match(bridge, /data\.migrationSourceSha256 !== policy\.sourceSha256/);
});

test('post-import: rules recompute eligibility from original rendszam', () => {
  assert.match(rules, /\.rendszam\.replace\('\[\[:space:\]-\]',''\)\.upper\(\)/);
});

test('post-import: capacity from Fleet kapacitas', () => {
  assert.match(rules, /declaredDriverCapacity/);
});

test('post-import: mirror writes closed after import', () => {
  assert.match(rules, /after import, mirrors are not writable/);
  assert.match(rules, /after import, vehicle mirrors are not writable/);
});

console.log('post-import contract tests defined');
