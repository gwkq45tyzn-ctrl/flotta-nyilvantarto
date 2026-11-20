import test from 'node:test';
import assert from 'node:assert/strict';

// Pure model of the bridge projector. The real function lives in the browser
// bridge; this test locks the contract the rules expect.
function projectStrictMasters(draft) {
  const plate = s => String(s || '').replace(/[\s-]/g, '').toUpperCase();
  const code = s => String(s || '').trim().toUpperCase();
  const drivers = (draft.drivers || []).map(d => {
    const id = code(d.daCode);
    if (!id) return null;
    return { id, data: { name: String(d.name || d.nev || '').trim(), daCode: id, vendor: String(d.agency || d.vendor || '').trim(), capacity: Number(d.kapacitas || d.capacity || 0), active: ['aktiv','aktív'].includes(String(d.status || '').toLowerCase()) } };
  }).filter(Boolean);
  const vehicles = (draft.vehicles || []).map(v => {
    const id = plate(v.rendszam);
    if (!id) return null;
    const model = [String(v.gyartmany || ''), String(v.modell || '')].filter(Boolean).join(' ');
    const st = String(v.status || '').toLowerCase();
    const status = ['aktiv','aktív'].includes(st) ? 'Elérhető' : st === 'szerviz' ? 'Szerviz' : 'Leállított';
    return { id, data: { plate: id, model, status } };
  }).filter(Boolean);
  return { drivers, vehicles };
}

test('projects strict fields and drops rich history', () => {
  const draft = {
    drivers: [{ daCode: 'DA0001', name: 'Teszt', agency: 'Vendor', status: 'aktiv', kapacitas: 80, history: [{ secret: 'x' }] }],
    vehicles: [{ rendszam: 'ABC-123', gyartmany: 'Ford', modell: 'Transit', status: 'aktiv', history: [{ note: 'private' }] }]
  };
  const p = projectStrictMasters(draft);
  assert.equal(p.drivers[0].id, 'DA0001');
  assert.equal(p.drivers[0].data.active, true);
  assert.ok(!p.drivers[0].data.history);
  assert.equal(p.vehicles[0].id, 'ABC123');
  assert.equal(p.vehicles[0].data.status, 'Elérhető');
  assert.ok(!p.vehicles[0].data.history);
});

test('unknown status fails closed to Leállított', () => {
  const p = projectStrictMasters({ vehicles: [{ rendszam: 'XYZ9', status: 'unknown' }] });
  assert.equal(p.vehicles[0].data.status, 'Leállított');
});

console.log('s7 projection contract tests defined');
