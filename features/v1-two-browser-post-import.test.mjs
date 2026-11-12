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

test('two-browser post-import: live keyed authority plus frozen original Fleet index are both enforced', () => {
  // The old test expected the original drivers array to be read by Rules
  // for capacity. That is deliberately no longer authoritative after seal.
  // Demand the current normalized-keyed driver capacity AND the original
  // frozen vehicle identity as well as immutable import source indices.
  assert.ok(rules.includes(
    'let keyed = getAfter(/databases/$(database)/documents/flottaDrivers/$(driverId)).data'
  ),'capacity must be read from the live keyed Fleet driver');
  assert.ok(rules.includes(
    'getAfter(/databases/$(database)/documents/flottaSharedState/current).data.vehicles[request.resource.data.vehicleIndex].rendszam'
  ),'original frozen plate identity must be verified');
  assert.ok(rules.includes(
    'getAfter(/databases/$(database)/documents/flottaDrivers/$(request.resource.data.driverId)).data.sourceIndex == request.resource.data.driverIndex'
  ),'driver source index must be server-verified');
  assert.ok(rules.includes(
    'getAfter(/databases/$(database)/documents/flottaVehicles/$(request.resource.data.vehicleId)).data.sourceIndex == request.resource.data.vehicleIndex'
  ),'vehicle source index must be server-verified');
});

test('two-browser post-import: booked capacity from current canonical KEYED Fleet, not stale legacy array', () => {
  assert.match(rules, /function declaredDriverCapacity\(driverId, driverIndex\)/);
  assert.match(rules, /let keyed = getAfter\(\/databases\/\$\(database\)\/documents\/flottaDrivers\/\$\(driverId\)\)\.data/);
  assert.match(rules, /return keyed\.keys\(\)\.hasAny\(\['kapacitas'\]\) \? keyed\.kapacitas : null/);
  assert.doesNotMatch(rules, /capacity != null \? capacity\.data\.capacity/);
});

test('two-browser post-import: Unicode plate rejected', () => {
  assert.match(rules, /rendszam\.matches\('\^\[A-Za-z0-9 -\]\{4,40\}\$'\)/);
});

console.log('two-browser post-import contract tests defined');
