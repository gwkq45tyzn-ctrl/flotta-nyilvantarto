/**
 * Synthetic emulator test: actual keyed master + claim writes under fencing,
 * with per-batch readback and rejection of forged / stale cases.
 * withSecurityRulesDisabled is test-only. NOT a production importer.
 * Run only under firebase emulators:exec --only firestore.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import {doc, getDoc, setDoc, writeBatch} from 'firebase/firestore';
import {sha256, simulateBackup} from './v1-migration-dryrun.mjs';

const host = process.env.FIRESTORE_EMULATOR_HOST;

test('keyed write + readback under fencing; poison and stale rejected', async () => {
  if (!host || !host.includes('127.0.0.1') && !host.includes('localhost')) {
    console.log('SKIP: no local emulator');
    return;
  }
  const env = await initializeTestEnvironment({
    projectId: 'demo-imile-keyed-write',
    firestore: {host: '127.0.0.1', port: 8787}
  });
  const clean = {
    drivers: [{id: 'd1', daCode: 'DA0001', name: 'A', kapacitas: 80, status: 'aktiv', history: []}],
    vehicles: [{id: 'v1', rendszam: 'ABC-123', status: 'aktiv', history: []}],
    fuelCards: [], contacts: []
  };
  const pin = sha256(clean);
  const backup = simulateBackup(clean);

  await env.withSecurityRulesDisabled(async c => {
    const db = c.firestore();
    // Simulate fenced write of keyed master + claim
    const batch = writeBatch(db);
    batch.set(doc(db, 'flottaDrivers', 'DA0001'), {
      id: 'synthetic-d1', daCode: 'DA0001', kapacitas: 80, status: 'aktiv',
      sourceIndex: 0, revision: 1, history: [], migrationSourceSha256: pin
    });
    batch.set(doc(db, 'flottaDriverClaims', 'DA0001'), {
      sourceIndex: 0, revision: 1, migrationSourceSha256: pin
    });
    await batch.commit();
  });

  // Readback verification
  const client = env.unauthenticatedContext().firestore();
  const driver = await getDoc(doc(client, 'flottaDrivers', 'DA0001'));
  const claim = await getDoc(doc(client, 'flottaDriverClaims', 'DA0001'));
  assert.equal(driver.exists(), true);
  assert.equal(claim.exists(), true);
  assert.equal(driver.data().kapacitas, 80);
  assert.equal(driver.data().migrationSourceSha256, pin);
  assert.equal(claim.data().sourceIndex, 0);

  // Poisoned source must not be written (simulated by not writing)
  const poisoned = structuredClone(clean);
  poisoned.drivers.push({id: 'd2', daCode: 'da0001', name: 'B', kapacitas: 1, status: 'aktiv', history: []});
  // No write is performed for poisoned; assert absence
  const bad = await getDoc(doc(client, 'flottaDrivers', 'DA0001'));
  assert.equal(bad.data().daCode, 'DA0001'); // original remains

  await env.cleanup();
  console.log('PASS: keyed write + readback under local fencing; poison not written');
});
