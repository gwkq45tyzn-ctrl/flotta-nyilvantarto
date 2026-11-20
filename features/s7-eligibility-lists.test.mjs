import test from 'node:test';
import assert from 'node:assert/strict';

function projectStrictMasters(draft) {
  const plate = s => String(s || '').replace(/[\s-]/g, '').toUpperCase();
  const code = s => String(s || '').trim().toUpperCase();
  const drivers = (draft.drivers || []).map(d => {
    const id = code(d.daCode);
    if (!id) return null;
    return { id, data: { active: ['aktiv','aktív'].includes(String(d.status || '').toLowerCase()) } };
  }).filter(Boolean);
  const vehicles = (draft.vehicles || []).map(v => {
    const id = plate(v.rendszam);
    if (!id) return null;
    const st = String(v.status || '').toLowerCase();
    const status = ['aktiv','aktív'].includes(st) ? 'Elérhető' : st === 'szerviz' ? 'Szerviz' : 'Leállított';
    return { id, data: { status } };
  }).filter(Boolean);
  return { drivers, vehicles };
}

function eligibility(draft) {
  const p = projectStrictMasters(draft);
  return {
    eligibleDrivers: p.drivers.filter(d => d.data.active).map(d => d.id),
    eligibleVehicles: p.vehicles.filter(v => v.data.status === 'Elérhető').map(v => v.id)
  };
}

test('service vehicle is not eligible', () => {
  const e = eligibility({ vehicles: [{ rendszam: 'ABC-123', status: 'szerviz' }], drivers: [] });
  assert.deepEqual(e.eligibleVehicles, []);
});

test('inactive driver is not eligible', () => {
  const e = eligibility({ drivers: [{ daCode: 'DA0001', status: 'inaktiv' }], vehicles: [] });
  assert.deepEqual(e.eligibleDrivers, []);
});

test('active master is eligible', () => {
  const e = eligibility({
    drivers: [{ daCode: 'DA0001', status: 'aktiv' }],
    vehicles: [{ rendszam: 'ABC-123', status: 'aktiv' }]
  });
  assert.deepEqual(e.eligibleDrivers, ['DA0001']);
  assert.deepEqual(e.eligibleVehicles, ['ABC123']);
});

console.log('eligibility list tests defined');
