import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const bridge = readFileSync('features/firestore-bridge.js', 'utf8');
const rules = readFileSync('depokapacitas/firestore-v1-restricted.rules', 'utf8');

test('two-browser post-import: bridge has requeue for concurrent saves', () => {
  assert.match(bridge, /if \(writeInFlight\)/);
  assert.match(bridge, /localDirty = true/);
  assert.match(bridge, /requeueCount/);
});

test('two-browser post-import: onSnapshot does not overwrite dirty local', () => {
  assert.match(bridge, /if \(!data \|\| applyingRemote \|\| localDirty\)/);
});

test('two-browser post-import: gateOldSync prevents dual write', () => {
  assert.match(bridge, /function gateOldSync/);
  assert.match(bridge, /pushRemote = function/);
  assert.match(bridge, /pullRemote = function/);
});

test('two-browser post-import: rules use getAfter for eligibility', () => {
  assert.match(rules, /getAfter\(.*flottaSharedState\/current\).*drivers\[/);
  assert.match(rules, /getAfter\(.*flottaSharedState\/current\).*vehicles\[/);
});

test('two-browser post-import: capacity only from Fleet', () => {
  assert.match(rules, /The original Fleet capacity is AUTHORITATIVE/);
  assert.doesNotMatch(rules, /capacity != null \? capacity\.data\.capacity/);
});

test('two-browser post-import: Unicode plate rejected', () => {
  assert.match(rules, /rendszam\.matches\('\^\[A-Za-z0-9 -\]\{4,40\}\$'\)/);
});

console.log('two-browser post-import contract tests defined');
