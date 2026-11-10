/**
 * Synthetic tests for V1 migration dry-run / backup / restore.
 * Run with: node --test tools/v1-migration-dryrun.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { preflight, buildPlan, simulateBackup, restoreDrill, detectPartial, sha256 } from './v1-migration-dryrun.mjs';

const goodSnapshot = {
  vehicles: [{ id: 'v1', rendszam: 'ABC-123', status: 'aktiv', history: [{ event: 'service' }] }],
  drivers: [{ id: 'd1', daCode: 'DA0001', name: 'Teszt Futár', kapacitas: 80, status: 'aktiv', history: [{ event: 'status' }] }],
  fuelCards: [{ code: 'FC1', provider: 'MOL' }],
  contacts: [{ code: 'C1', name: 'Kapcsolat' }]
};

const badDuplicate = {
  ...goodSnapshot,
  drivers: [
    { daCode: 'DA0001', name: 'A' },
    { daCode: 'da0001', name: 'B' }
  ]
};

test('preflight accepts good synthetic snapshot and computes SHA', () => {
  const res = preflight(goodSnapshot);
  assert.equal(res.ok, true);
  assert.equal(res.counts.drivers, 1);
  assert.equal(res.counts.vehicles, 1);
  assert.match(res.sourceSha256, /^[a-f0-9]{64}$/);
});

test('preflight rejects duplicate normalized DA', () => {
  const res = preflight(badDuplicate);
  assert.equal(res.ok, false);
  assert.ok(res.errors.some(e => e.includes('Duplicate DA')));
});

test('dry-run plan preserves rich history and sets revision', () => {
  const pre = preflight(goodSnapshot);
  const plan = buildPlan(goodSnapshot, pre);
  assert.equal(plan.sealed, true);
  assert.equal(plan.drivers[0].data.history.length, 1);
  assert.equal(plan.drivers[0].data.kapacitas, 80);
  assert.equal(plan.drivers[0].data.revision, 1);
  assert.equal(plan.sourceSha256, pre.sourceSha256);
});

test('backup + restore drill verifies SHA and counts', () => {
  const backup = simulateBackup(goodSnapshot);
  const expected = backup.sourceSha256;
  const result = restoreDrill(backup, expected);
  assert.equal(result.ok, true);
  assert.equal(result.restoredCounts.drivers, 1);
  assert.equal(result.historyPreserved, true);
});

test('restore drill refuses on SHA mismatch', () => {
  const backup = simulateBackup(goodSnapshot);
  const result = restoreDrill(backup, '0'.repeat(64));
  assert.equal(result.ok, false);
  assert.match(result.error, /SHA mismatch/);
});

test('detectPartial identifies interrupted migration', () => {
  const pre = preflight(goodSnapshot);
  const plan = buildPlan(goodSnapshot, pre);
  const partial = detectPartial(plan, { 'DA0001': true }); // missing vehicle
  assert.equal(partial.complete, false);
  assert.ok(partial.missing.length > 0);
});

test('SHA is deterministic', () => {
  const a = sha256(goodSnapshot);
  const b = sha256(JSON.parse(JSON.stringify(goodSnapshot)));
  assert.equal(a, b);
});
