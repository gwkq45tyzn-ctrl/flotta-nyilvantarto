import assert from 'node:assert/strict';
import { canonicalStringify } from './migration-manifest.mjs';

const snap = {
  vehicles: Array.from({ length: 50 }, (_, i) => ({ id: 'v' + i, rendszam: 'ABC' + i, history: [{ type: 'atadas', note: 'x'.repeat(100) }] })),
  drivers: Array.from({ length: 30 }, (_, i) => ({ id: 'd' + i, daCode: 'DA' + i })),
  fuelCards: [],
  contacts: []
};
const json = canonicalStringify(snap);
const bytes = Buffer.byteLength(json, 'utf8');
assert.ok(bytes > 0);
assert.ok(bytes < 1_048_576, 'synthetic snapshot should be under 1 MiB');
console.log('size check passed, bytes =', bytes);
