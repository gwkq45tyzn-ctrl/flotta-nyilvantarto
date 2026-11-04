import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
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

test('ACTUAL Depot application uses one fail-closed getter across all operational paths', () => {
  const app = readFileSync(new URL('./app.js',import.meta.url),'utf8');
  assert.match(app,/const get=name=>\\['drivers','vehicles'\\]\\.includes\\(name\\)/);
  assert.match(app,/state\\.canonicalMaster\\?\\.trusted\\?state\\.canonicalMaster\\[name\\]:\\[\\]/);
  assert.match(app,/function nextDayPanel\\(\\)[\\s\\S]*?drivers:get\\('drivers'\\),vehicles:get\\('vehicles'\\)/);
  assert.match(app,/function drivers\\(\\)\\{const list=get\\('drivers'\\)/);
  assert.match(app,/function vehicles\\(\\)\\{const list=get\\('vehicles'\\)/);
  assert.match(app,/function planning\\(\\)\\{const ds=get\\('drivers'\\)[\\s\\S]*?const vs=get\\('vehicles'\\)/);
  assert.match(app,/function refreshCanonicalMaster\\(\\)/);
});
test('actual UI revokes old master choices on offline, stale TTL, and foreground return', () => {
  const app = readFileSync(new URL('./app.js',import.meta.url),'utf8');
  assert.match(app,/window\\.addEventListener\\('offline'/);
  assert.match(app,/state\\.canonicalFleetRaw=null;/);
  assert.match(app,/state\\.canonicalApproval=null;/);
  assert.match(app,/window\\.addEventListener\\('online'/);
  assert.match(app,/document\\.addEventListener\\('visibilitychange'/);
  assert.match(app,/wasTrusted!==isTrusted/);
  assert.match(app,/\\['drivers','vehicles','planning'\\]\\.includes\\(state\\.view\\)/);
  assert.match(app,/if\\(!document\\.hidden&&!\\$\\('shell'\\)\\.hidden\\)\\{updateLiveIndicator\\(\\);render\\(\\);\\}/);
});

console.log('no-fallback tests defined');
