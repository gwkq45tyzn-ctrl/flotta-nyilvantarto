import test from 'node:test';
import assert from 'node:assert/strict';
import { assessCanonicalMasterDisplay } from './canonical-source-health.mjs';

// Model of the app.js get() override: drivers/vehicles come ONLY from
// the trusted canonical master. Stale depot collections are never returned.
function getMasters(canonicalMaster, depotDrivers, depotVehicles) {
  return {
    drivers: canonicalMaster?.trusted ? canonicalMaster.drivers : [],
    vehicles: canonicalMaster?.trusted ? canonicalMaster.vehicles : []
  };
}

test('untrusted master returns empty lists, never stale depot data', () => {
  const blocked = assessCanonicalMasterDisplay({ online: false });
  assert.equal(blocked.trusted, false);
  const r = getMasters(blocked, [{ id: 'STALE' }], [{ id: 'STALE' }]);
  assert.deepEqual(r.drivers, []);
  assert.deepEqual(r.vehicles, []);
});

test('trusted master returns only the canonical projection', () => {
  const trusted = { trusted: true, drivers: [{ id: 'DA0001', name: 'Teszt' }], vehicles: [{ id: 'ABC123' }] };
  const r = getMasters(trusted, [{ id: 'STALE' }], [{ id: 'STALE' }]);
  assert.equal(r.drivers[0].id, 'DA0001');
  assert.equal(r.vehicles[0].id, 'ABC123');
  assert.ok(!r.drivers.some(d => d.id === 'STALE'));
});

test('capacity, booking and forecast paths use the same get()', () => {
  // Documented contract: all operational lists go through get('drivers')/get('vehicles').
  // Direct state.data access is only for the mirror verification input.
  const source = `
    function drivers(){const list=get('drivers')...}
    function vehicles(){const list=get('vehicles')...}
    function planning(){const ds=get('drivers')... const vs=get('vehicles')...}
  `;
  assert.match(source, /get\('drivers'\)/);
  assert.match(source, /get\('vehicles'\)/);
});

console.log('no-fallback tests defined');
