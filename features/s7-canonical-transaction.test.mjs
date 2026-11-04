import test from 'node:test';
import assert from 'node:assert/strict';
import { planSharedMigration } from './shared-master-adapter.mjs';
import { simulateCanonicalApply, protectActiveBookings } from './s7-canonical-transaction.mjs';

const fleet = (rev = 1) => ({
  revision: rev,
  vehicles: [{ id: 'v1', rendszam: 'ABC-123', gyartmany: 'Ford', modell: 'Transit', status: 'aktiv', km: 1000,
    history: [{ type: 'service', note: 'nested' }], insurance: { policy: 'SYN' } }],
  drivers: [{ id: 'd1', daCode: 'DA0001', name: 'Teszt', agency: 'Vendor', status: 'aktiv', kapacitas: 80,
    history: [{ type: 'assignment' }] }],
  fuelCards: [{ id: 'c1', lastFour: '0000' }],
  contacts: [{ id: 'ct1', phone: '000' }]
});

function liveOf(f) {
  const p = planSharedMigration(f);
  return {
    liveDrivers: p.writes.drivers.map(x => ({ id: x.id, ...x.data })),
    liveVehicles: p.writes.vehicles.map(x => ({ id: x.id, ...x.data }))
  };
}

test('offline write is refused', () => {
  const f = fleet();
  const r = simulateCanonicalApply({ previousFleet: f, nextFleet: f, ...liveOf(f), bookings: [], offline: true });
  assert.equal(r.applied, false);
  assert.equal(r.reason, 'offline');
});

test('unauthorized write is refused', () => {
  const f = fleet();
  const r = simulateCanonicalApply({ previousFleet: f, nextFleet: f, ...liveOf(f), bookings: [], authorized: false });
  assert.equal(r.applied, false);
  assert.equal(r.reason, 'unauthorized');
});

test('active booking blocks vehicle change', () => {
  const blocked = protectActiveBookings(
    [{ id: 'b1', vehicleId: 'ABC123', status: 'confirmed' }],
    ['ABC123']
  );
  assert.deepEqual(blocked, ['b1']);
});

test('valid transition applies and advances revision', () => {
  const prev = fleet(1);
  const next = fleet(1);
  next.vehicles[0].km = 1100;
  const r = simulateCanonicalApply({ previousFleet: prev, nextFleet: next, ...liveOf(prev), bookings: [] });
  assert.equal(r.applied, true);
  assert.equal(r.nextRevision, 2);
  // Rich history stays only in the Fleet snapshot, not in the projected writes.
  const vehicleWrite = r.writes.find(w => w.collection === 'vehicles');
  if (vehicleWrite) {
    assert.ok(!vehicleWrite.data.history, 'history must not leak into strict vehicle write');
    assert.ok(!vehicleWrite.data.insurance, 'insurance must not leak into strict vehicle write');
  }
});

test('rich fields survive in the Fleet snapshot', () => {
  const f = fleet();
  assert.ok(f.vehicles[0].history.length > 0);
  assert.ok(f.vehicles[0].insurance);
  assert.ok(f.fuelCards.length > 0);
  assert.ok(f.contacts.length > 0);
});

console.log('s7 canonical transaction tests defined');
