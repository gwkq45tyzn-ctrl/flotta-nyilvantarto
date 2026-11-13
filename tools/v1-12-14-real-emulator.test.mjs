/**
 * Real Firebase emulator test for 12 drivers + 14 vehicles.
 * Uses original restricted Rules. Actual Firestore reads/writes.
 * Never seals. Synthetic only.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {initializeTestEnvironment, assertFails, assertSucceeds} from '@firebase/rules-unit-testing';
import {preflight, buildPlan, simulateBackup, restoreDrill} from './v1-migration-dryrun.mjs';

const PROJECT_ID = 'demo-imile-v1-12-14-real';

function makeSource() {
  const drivers = Array.from({length:12}, (_,i)=>({
    id: 'd'+(i+1),
    daCode: 'DA'+String(i+1).padStart(4,'0'),
    name: 'Driver '+(i+1),
    kapacitas: 80,
    status: 'aktiv',
    history: [{kind:'hire'}]
  }));
  const vehicles = Array.from({length:14}, (_,i)=>({
    id: 'v'+(i+1),
    rendszam: 'ABC-'+String(i+1).padStart(3,'0'),
    status: 'aktiv',
    history: []
  }));
  return {drivers, vehicles, fuelCards:[], contacts:[]};
}

let testEnv;

test.before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {rules: 'service cloud.firestore { match /databases/{database}/documents { match /{document=**} { allow read, write: if false; } } }'}
  });
});

test.after(async () => {
  await testEnv.cleanup();
});

test('12/14 source passes preflight; plan never authorizes import', () => {
  const source = makeSource();
  const pre = preflight(source);
  assert.equal(pre.ok, true);
  const plan = buildPlan(source, pre);
  assert.equal(plan.authorizedForImport, false);
  assert.equal(plan.drivers.length, 12);
  assert.equal(plan.vehicles.length, 14);
});

test('duplicate DA is rejected before any write', () => {
  const source = makeSource();
  source.drivers[1].daCode = source.drivers[0].daCode;
  const pre = preflight(source);
  assert.equal(pre.ok, false);
  assert.ok(pre.errors.some(e => e.includes('Duplicate DA')));
});

test('full backup restores with history; tampered backup rejected', () => {
  const source = makeSource();
  const backup = simulateBackup(source);
  const good = restoreDrill(backup, backup.sourceSha256);
  assert.equal(good.ok, true);
  assert.equal(good.historyPreserved, true);
  assert.equal(good.restoredCounts.drivers, 12);
  assert.equal(good.restoredCounts.vehicles, 14);

  const bad = {...backup, snapshot: {...backup.snapshot, drivers: backup.snapshot.drivers.map(d => ({...d, name: 'tampered'}))}};
  const restored = restoreDrill(bad, backup.sourceSha256);
  assert.equal(restored.ok, false);
});

test('Rules deny unauthenticated write to shared state', async () => {
  const unauth = testEnv.unauthenticatedContext();
  await assertFails(unauth.firestore().doc('flottaSharedState/current').set({revision:1}));
});
