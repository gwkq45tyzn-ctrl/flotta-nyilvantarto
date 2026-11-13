/**
 * Proof that a full four-block backup can restore the complete Flotta with history.
 * Synthetic only. Uses the real dry-run module.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {preflight, simulateBackup, restoreDrill} from './v1-migration-dryrun.mjs';

function makeFull() {
  return {
    drivers: Array.from({length:12}, (_,i)=>({
      id:'d'+(i+1), daCode:'DA'+String(i+1).padStart(4,'0'),
      name:'D'+(i+1), kapacitas:80, status:'aktiv',
      history:[{kind:'hire'}]
    })),
    vehicles: Array.from({length:14}, (_,i)=>({
      id:'v'+(i+1), rendszam:'ABC-'+String(i+1).padStart(3,'0'),
      status:'aktiv', history:[]
    })),
    fuelCards:[{id:'fc1', cardNumber:'1234'}],
    contacts:[{id:'c1', name:'Contact'}]
  };
}

test('full four-block backup restores with history preserved', () => {
  const source = makeFull();
  const pre = preflight(source);
  assert.equal(pre.ok, true);
  const backup = simulateBackup(source);
  const restored = restoreDrill(backup, backup.sourceSha256);
  assert.equal(restored.ok, true);
  assert.equal(restored.historyPreserved, true);
  assert.equal(restored.restoredCounts.drivers, 12);
  assert.equal(restored.restoredCounts.vehicles, 14);
  assert.equal(restored.restoredCounts.fuelCards, 1);
  assert.equal(restored.restoredCounts.contacts, 1);
});

test('tampered history is rejected on restore', () => {
  const source = makeFull();
  const backup = simulateBackup(source);
  backup.snapshot.drivers[0].history = null;
  const restored = restoreDrill(backup, backup.sourceSha256);
  assert.equal(restored.ok, false);
});
