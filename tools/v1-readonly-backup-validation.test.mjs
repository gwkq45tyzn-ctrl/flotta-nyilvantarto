/**
 * Tests for read-only four-block backup validation.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {validateBackup} from './v1-readonly-backup-validation.mjs';

const good = () => ({
  drivers:[{daCode:'DA0001',name:'A',kapacitas:80,status:'aktiv',history:[{kind:'hire'}]}],
  vehicles:[{rendszam:'ABC-123',status:'aktiv',history:[]}],
  fuelCards:[],contacts:[]
});

test('valid backup with history and identifiers passes', () => {
  const result = validateBackup(good());
  assert.equal(result.ok, true);
  assert.equal(result.driverCount, 1);
  assert.equal(result.vehicleCount, 1);
  assert.equal(result.sealed, false);
});

test('missing history or duplicate identifier fails', () => {
  const bad = good();
  delete bad.drivers[0].history;
  bad.vehicles.push({rendszam:'ABC-123',status:'aktiv',history:[]});
  const result = validateBackup(bad);
  assert.equal(result.ok, false);
  assert.ok(result.issues.some(i => i.startsWith('INVALID_DRIVER') || i.startsWith('DUPLICATE_VEHICLE')));
});

test('does not assume fixed record count', () => {
  const large = good();
  large.drivers = Array.from({length: 120}, (_,i) => ({
    daCode: 'DA' + String(i).padStart(4,'0'),
    name: 'D'+i, kapacitas: 80, status: 'aktiv', history: []
  }));
  const result = validateBackup(large);
  assert.equal(result.ok, true);
  assert.equal(result.driverCount, 120);
});
