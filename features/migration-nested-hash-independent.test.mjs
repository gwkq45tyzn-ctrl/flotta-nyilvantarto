import assert from 'node:assert/strict';
import { canonical, analyze } from './migration-size-probe.mjs';

// Independent check: a change deep inside vehicle history must change the hash.
// The old non-recursive JSON.stringify(obj, Object.keys(obj)) would miss this.
const base = {
  vehicles: [{
    id: 'v1',
    rendszam: 'ABC-123',
    history: [
      { type: 'atadas', date: '2026-01-01', km: 1000, note: 'első' },
      { type: 'tankolas', date: '2026-02-01', km: 1500, note: 'második' }
    ]
  }],
  drivers: [{ id: 'd1', daCode: 'DA001' }],
  revision: 1
};

const mutated = structuredClone(base);
mutated.vehicles[0].history[1].note = 'módosított';

const h1 = analyze(base).hash;
const h2 = analyze(mutated).hash;
assert.notEqual(h1, h2, 'nested history note change must change hash');

// Order independence
const reordered = {
  revision: 1,
  drivers: [{ daCode: 'DA001', id: 'd1' }],
  vehicles: [{
    history: [
      { note: 'első', km: 1000, date: '2026-01-01', type: 'atadas' },
      { note: 'második', km: 1500, date: '2026-02-01', type: 'tankolas' }
    ],
    rendszam: 'ABC-123',
    id: 'v1'
  }]
};
assert.equal(canonical(base), canonical(reordered), 'key order must not change canonical form');
assert.equal(analyze(base).hash, analyze(reordered).hash);

// Non-recursive stringify would drop nested keys – prove the difference
const nonRecursive = JSON.stringify(base, Object.keys(base));
assert.ok(!nonRecursive.includes('atadas'), 'non-recursive stringify drops nested history');
assert.ok(canonical(base).includes('atadas'), 'recursive canonical keeps nested history');

console.log('independent nested history hash test passed');
