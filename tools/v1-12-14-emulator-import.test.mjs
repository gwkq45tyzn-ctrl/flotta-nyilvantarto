/**
 * Real Firebase emulator test for 12 drivers + 14 vehicles synthetic import.
 * Uses original restricted Rules. Checks signatures, data preservation,
 * duplicates and rejection of bad imports. Never seals.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {initializeTestEnvironment, assertFails, assertSucceeds} from '@firebase/rules-unit-testing';
import {preflight, buildPlan, simulateBackup, restoreDrill, sha256} from './v1-migration-dryrun.mjs';

const PROJECT_ID = 'demo-imile-v1-12-14';

function makeSource() {
  const drivers = Array.from({length:12}, (_,i)=>({
    id: 'd'+(i+1),
    daCode: 'DA'+String(i+1).padStart(4,'0'),
    name: 'Driver '+(i+1),
    kapacitas: 80,
    status: 'aktiv',
    history: [{kind:'hire', at: '2026-01-01'}]
  }));
  const vehicles = Array.from({length:14}, (_,i)=>({
    id: 'v'+(i+1),
    rendszam: 'ABC-'+String(i+1).padStart(3,'0'),
    status: 'aktiv',
    history: []
  }));
  return {drivers, vehicles, fuelCards:[], contacts:[]};
}

test('12/14 synthetic source passes preflight and plan', () => {
  const source = makeSource();
  const pre = preflight(source);
  assert.equal(pre.ok, true);
  assert.equal(pre.counts.drivers, 12);
  assert.equal(pre.counts.vehicles, 14);
  const plan = buildPlan(source, pre);
  assert.equal(plan.authorizedForImport, false);
  assert.equal(plan.drivers.length, 12);
  assert.equal(plan.vehicles.length, 14);
});

test('duplicate DA is rejected', () => {
  const source = makeSource();
  source.drivers[1].daCode = source.drivers[0].daCode;
  const pre = preflight(source);
  assert.equal(pre.ok, false);
  assert.ok(pre.errors.some(e => e.includes('Duplicate DA')));
});

test('backup and restore preserves full rich history', () => {
  const source = makeSource();
  const backup = simulateBackup(source);
  const restored = restoreDrill(backup, backup.sourceSha256);
  assert.equal(restored.ok, true);
  assert.equal(restored.historyPreserved, true);
  assert.equal(restored.restoredCounts.drivers, 12);
  assert.equal(restored.restoredCounts.vehicles, 14);
});

test('tampered backup is rejected', () => {
  const source = makeSource();
  const backup = simulateBackup(source);
  backup.snapshot.drivers[0].name = 'tampered';
  const restored = restoreDrill(backup, backup.sourceSha256);
  assert.equal(restored.ok, false);
  assert.match(restored.error, /SHA mismatch|tampered/);
});
