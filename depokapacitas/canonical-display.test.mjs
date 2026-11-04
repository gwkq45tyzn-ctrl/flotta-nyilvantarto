import test from 'node:test';
import assert from 'node:assert/strict';

// Pure model of the S7 display preference.
function chooseMasters(sharedFleet, depotDrivers, depotVehicles) {
  if (sharedFleet && sharedFleet.status === 'preview' &&
      Array.isArray(sharedFleet.drivers) && Array.isArray(sharedFleet.vehicles)) {
    return {
      drivers: sharedFleet.drivers.map(d => ({ id: d.id, ...d.data })),
      vehicles: sharedFleet.vehicles.map(v => ({ id: v.id, ...v.data })),
      source: 'flotta'
    };
  }
  return { drivers: depotDrivers, vehicles: depotVehicles, source: 'depot' };
}

test('prefers Flotta projection when preview-ready', () => {
  const sf = {
    status: 'preview',
    drivers: [{ id: 'DA0001', data: { name: 'Teszt', daCode: 'DA0001' } }],
    vehicles: [{ id: 'ABC123', data: { plate: 'ABC123', status: 'Elérhető' } }]
  };
  const r = chooseMasters(sf, [{ id: 'OLD' }], [{ id: 'OLD' }]);
  assert.equal(r.source, 'flotta');
  assert.equal(r.drivers[0].name, 'Teszt');
  assert.equal(r.vehicles[0].plate, 'ABC123');
});

test('falls back to depot collections when Flotta not ready', () => {
  const r = chooseMasters({ status: 'waiting' }, [{ id: 'D1' }], [{ id: 'V1' }]);
  assert.equal(r.source, 'depot');
  assert.equal(r.drivers[0].id, 'D1');
});

test('falls back when projection arrays missing', () => {
  const r = chooseMasters({ status: 'preview' }, [{ id: 'D1' }], [{ id: 'V1' }]);
  assert.equal(r.source, 'depot');
});

console.log('canonical display tests defined');
