import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

function normalize(obj) {
  return JSON.stringify(obj, Object.keys(obj).sort());
}
function hashOf(obj) {
  return createHash('sha256').update(normalize(obj)).digest('hex');
}

const snap = {
  vehicles: [{ id: 'v1', rendszam: 'ABC-123', status: 'Aktív' }],
  drivers: [{ id: 'd1', daCode: 'DA001', name: 'Teszt' }],
  fuelCards: [],
  contacts: []
};
const h1 = hashOf(snap);
const h2 = hashOf(snap);
assert.equal(h1, h2);
assert.equal(h1.length, 64);
console.log('migration manifest hash test passed');
