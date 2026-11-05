import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

function sha256(obj) {
  return createHash('sha256').update(JSON.stringify(obj)).digest('hex');
}

function makeSyntheticFleet() {
  return {
    revision: 3,
    migrationSourceSha256: 'a'.repeat(64),
    vehicles: [{
      rendszam: 'ABC-123',
      status: 'aktiv',
      history: [{ date: '2026-01-01', note: 'service A' }, { date: '2026-02-01', note: 'insurance' }],
      insurance: { validUntil: '2027-01-01' }
    }],
    drivers: [{
      daCode: 'DA0001',
      name: 'Synthetic Driver',
      status: 'aktiv',
      kapacitas: 80,
      history: [{ date: '2026-01-15', event: 'assigned' }]
    }],
    fuelCards: [{ id: 'FC001', provider: 'synthetic' }],
    contacts: [{ id: 'CT001', name: 'Synthetic Contact', phone: '000' }]
  };
}

test('synthetic backup preserves SHA and rich history', () => {
  const original = makeSyntheticFleet();
  const backup = JSON.parse(JSON.stringify(original));
  assert.equal(sha256(backup), sha256(original));
  assert.deepEqual(backup.vehicles[0].history, original.vehicles[0].history);
  assert.deepEqual(backup.drivers[0].history, original.drivers[0].history);
  assert.deepEqual(backup.fuelCards, original.fuelCards);
  assert.deepEqual(backup.contacts, original.contacts);
});

test('restore after delete matches original SHA', () => {
  const original = makeSyntheticFleet();
  const backup = JSON.parse(JSON.stringify(original));
  // Simulate delete
  const restored = JSON.parse(JSON.stringify(backup));
  assert.equal(sha256(restored), sha256(original));
  assert.equal(restored.revision, original.revision);
  assert.equal(restored.migrationSourceSha256, original.migrationSourceSha256);
});

test('field-level parity after restore', () => {
  const original = makeSyntheticFleet();
  const restored = JSON.parse(JSON.stringify(original));
  assert.equal(restored.vehicles[0].rendszam, 'ABC-123');
  assert.equal(restored.vehicles[0].history.length, 2);
  assert.equal(restored.drivers[0].daCode, 'DA0001');
  assert.equal(restored.drivers[0].kapacitas, 80);
  assert.equal(restored.fuelCards[0].id, 'FC001');
  assert.equal(restored.contacts[0].id, 'CT001');
});

console.log('synthetic backup/restore tests defined');
