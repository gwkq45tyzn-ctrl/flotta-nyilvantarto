/**
 * Offline 1 MiB probe. No network, no Firebase writes.
 * Canonical JSON byte count is a conservative lower bound, not the
 * Firestore encoded size. A value over 900 KiB is a warning; over 1 MiB
 * is a hard stop for a single document.
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

function canonical(obj) {
  return JSON.stringify(obj, Object.keys(obj).sort());
}
function analyze(snap) {
  const vehicles = Array.isArray(snap.vehicles) ? snap.vehicles.length : 0;
  const drivers = Array.isArray(snap.drivers) ? snap.drivers.length : 0;
  const history = (snap.vehicles || []).reduce((n, v) => n + (Array.isArray(v.history) ? v.history.length : 0), 0);
  const json = canonical(snap);
  const bytes = Buffer.byteLength(json, 'utf8');
  const warn = bytes > 900 * 1024;
  const stop = bytes > 1_048_576;
  return { vehicles, drivers, history, bytes, warn, stop, hash: createHash('sha256').update(json).digest('hex') };
}

const path = process.argv[2];
const snap = path
  ? JSON.parse(readFileSync(path, 'utf8'))
  : { vehicles: [{ id: 'v1', history: [{ t: 'atadas' }] }], drivers: [{ id: 'd1' }] };
const r = analyze(snap);
console.log(JSON.stringify(r, null, 2));
if (r.stop) { console.error('STOP: exceeds 1 MiB'); process.exitCode = 2; }
else if (r.warn) console.error('WARN: approaching 1 MiB');
