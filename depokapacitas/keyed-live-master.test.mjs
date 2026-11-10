/**
 * Tests for post-seal keyed live master projection.
 * Run: node --test depokapacitas/keyed-live-master.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { projectKeyedMasters, capacityFromKeyed } from './keyed-live-master.mjs';

function fakeSnap(docs, fromCache = false) {
  return {
    docs: docs.map(d => ({ id: d.id, data: () => d.data })),
    metadata: { fromCache, hasPendingWrites: false }
  };
}

const sealed = {
  sealed: true,
  drivers: [{ daCode: 'DA0001', id: 'd1' }],
  vehicles: [{ rendszam: 'ABC123', id: 'v1' }]
};

test('projects live keyed capacity and status after seal', () => {
  const dSnap = fakeSnap([{ id: 'DA0001', data: { daCode: 'DA0001', name: 'Teszt', kapacitas: 70, status: 'aktiv', history: [{ e: 1 }] } }]);
  const vSnap = fakeSnap([{ id: 'ABC123', data: { rendszam: 'ABC123', status: 'aktiv', history: [{ e: 2 }] } }]);
  const result = projectKeyedMasters(dSnap, vSnap, sealed);
  assert.equal(result.trusted, true);
  assert.equal(result.drivers[0].capacity, 70);
  assert.equal(result.drivers[0].active, true);
  assert.equal(result.vehicles[0].status, 'Elérhető');
  assert.equal(result.drivers[0].history.length, 1);
});

test('rejects cache / pending as non-authoritative', () => {
  const dSnap = fakeSnap([{ id: 'DA0001', data: { daCode: 'DA0001', kapacitas: 70, status: 'aktiv' } }], true);
  const vSnap = fakeSnap([{ id: 'ABC123', data: { rendszam: 'ABC123', status: 'aktiv' } }]);
  assert.equal(projectKeyedMasters(dSnap, vSnap, sealed), null);
});

test('fail-closed if archived identity missing from keyed', () => {
  const dSnap = fakeSnap([]); // missing DA0001
  const vSnap = fakeSnap([{ id: 'ABC123', data: { rendszam: 'ABC123', status: 'aktiv' } }]);
  assert.equal(projectKeyedMasters(dSnap, vSnap, sealed), null);
});

test('capacityFromKeyed returns numeric capacity', () => {
  assert.equal(capacityFromKeyed({ capacity: 70 }), 70);
  assert.equal(capacityFromKeyed({ capacity: -5 }), 0);
  assert.equal(capacityFromKeyed(null), 0);
});
