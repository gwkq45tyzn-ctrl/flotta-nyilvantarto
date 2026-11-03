/**
 * Offline migration dry-run. No network, no Firebase writes.
 * Usage: node features/migration-dry-run.mjs <path-to-flotta-export.json>
 * Or run without args for synthetic demo.
 */
import { readFileSync } from 'node:fs';
import { canonicalStringify } from './migration-manifest.mjs';
import { createHash } from 'node:crypto';

function hashOf(obj) {
  return createHash('sha256').update(canonicalStringify(obj)).digest('hex');
}

function analyze(snap) {
  const vehicles = Array.isArray(snap.vehicles) ? snap.vehicles.length : 0;
  const drivers = Array.isArray(snap.drivers) ? snap.drivers.length : 0;
  const fuelCards = Array.isArray(snap.fuelCards) ? snap.fuelCards.length : 0;
  const contacts = Array.isArray(snap.contacts) ? snap.contacts.length : 0;
  const history = (snap.vehicles || []).reduce((n, v) => n + (Array.isArray(v.history) ? v.history.length : 0), 0);
  const json = canonicalStringify(snap);
  const bytes = Buffer.byteLength(json, 'utf8');
  const over = bytes > 1_048_576;
  return { vehicles, drivers, fuelCards, contacts, history, bytes, over, hash: hashOf(snap) };
}

const path = process.argv[2];
let snap;
if (path) {
  snap = JSON.parse(readFileSync(path, 'utf8'));
} else {
  snap = {
    vehicles: [{ id: 'v1', rendszam: 'ABC-123', status: 'Aktív', history: [{ type: 'atadas' }] }],
    drivers: [{ id: 'd1', daCode: 'DA001', name: 'Teszt' }],
    fuelCards: [],
    contacts: []
  };
  console.log('(synthetic demo – pass a JSON path for real dry-run)');
}
const r = analyze(snap);
console.log(JSON.stringify(r, null, 2));
if (r.over) {
  console.error('WARNING: canonical JSON exceeds 1 MiB – do not import as single document');
  process.exitCode = 2;
}
