/**
 * Offline, read-only preflight for the legacy Fleet ONE-document snapshot.
 * Does NOT access Firebase, publish Rules, migrate data or prove live deploy.
 *
 * Document size estimation follows Firestore Native-mode storage-size rules:
 * https://firebase.google.com/docs/firestore/storage-size
 * Map values cost their nested field-name/value sizes PLUS 32 bytes; number
 * values cost 8 bytes; strings and field names are UTF-8 bytes PLUS 1.
 * The estimator applies to JSON-compatible values only. Firestore typed
 * values (Timestamp/GeoPoint/Bytes/Reference) need separate live verification.
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const LIMIT = 1_048_576;
const SAFE_DOCUMENT_LIMIT = LIMIT - 4; // Firestore REST document limit.
const WARN = 900 * 1024;
const MAX_VALUE = LIMIT - 89;
const DOCUMENT = 'flottaSharedState/current';
const utf8 = value => Buffer.byteLength(value, 'utf8');
const stringSize = value => utf8(value) + 1;

// Canonicalize RECURSIVELY: JSON.stringify(value, Object.keys(value))
// silently removes most nested Fleet history keys and is NOT acceptable.
export function canonical(value, seen = new Set()) {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Nonfinite number in snapshot');
    return JSON.stringify(value);
  }
  if (typeof value !== 'object') throw new TypeError('Non-JSON value in snapshot');
  if (seen.has(value)) throw new TypeError('Circular reference in snapshot');
  seen.add(value);
  try {
    if (Array.isArray(value)) return '[' + value.map(v => canonical(v, seen)).join(',') + ']';
    if (Object.getPrototypeOf(value) !== Object.prototype &&
        Object.getPrototypeOf(value) !== null)
      throw new TypeError('Non-plain object in JSON snapshot');
    return '{' + Object.keys(value).sort().map(key =>
      JSON.stringify(key) + ':' + canonical(value[key], seen)).join(',') + '}';
  } finally {
    seen.delete(value);
  }
}

function countFields(fields, depth) {
  if (!fields || Array.isArray(fields) || typeof fields !== 'object')
    throw new TypeError('Firestore document must be a JSON object');
  return Object.entries(fields).reduce((size, [name, value]) => {
    const fieldBytes = utf8(name);
    if (!fieldBytes || fieldBytes > 1500 || /^__.*__$/.test(name))
      throw new TypeError('Invalid Firestore field name');
    return size + stringSize(name) + valueSize(value, depth);
  }, 0);
}

function valueSize(value, depth) {
  if (value === null) return 1;
  if (typeof value === 'boolean') return 1;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Nonfinite number');
    return 8;
  }
  if (typeof value === 'string') {
    const size = stringSize(value);
    if (size > MAX_VALUE) throw new RangeError('Firestore field value exceeds 1 MiB - 89 bytes');
    return size;
  }
  if (depth >= 20) throw new RangeError('Firestore nested map/array depth exceeds 20');
  if (Array.isArray(value)) return value.reduce((n, v) => n + valueSize(v, depth + 1), 0);
  if (value && typeof value === 'object') return countFields(value, depth + 1) + 32;
  throw new TypeError('Non-JSON Firestore field type');
}

export function firestoreDocumentBytes(snap, documentPath = DOCUMENT) {
  const segments = documentPath.split('/');
  if (segments.length < 2 || segments.length % 2 !== 0 || segments.some(s => !s))
    throw new TypeError('Document path must be alternating collection/document IDs');
  const documentName = segments.reduce((n, part) => n + stringSize(part), 16);
  if (documentName > 6 * 1024) throw new RangeError('Document name exceeds 6 KiB');
  return documentName + countFields(snap, 0) + 32;
}

export function analyze(snap) {
  if (snap === null || typeof snap !== 'object' || Array.isArray(snap))
    throw new TypeError('Fleet snapshot must be a JSON object');
  const vehicles = Array.isArray(snap.vehicles) ? snap.vehicles.length : 0;
  const drivers = Array.isArray(snap.drivers) ? snap.drivers.length : 0;
  const history = Array.isArray(snap.vehicles)
    ? snap.vehicles.reduce((n, v) => n + (Array.isArray(v?.history) ? v.history.length : 0), 0)
    : 0;
  const json = canonical(snap);
  const jsonBytes = utf8(json);
  const hash = createHash('sha256').update(json).digest('hex');
  let firestoreBytes = null;
  let reason = null;
  try { firestoreBytes = firestoreDocumentBytes(snap); }
  catch (e) {
    if (!(e instanceof TypeError || e instanceof RangeError)) throw e;
    reason = e.message;
  }
  const stop = reason !== null || firestoreBytes >= SAFE_DOCUMENT_LIMIT;
  const warn = stop || firestoreBytes >= WARN;
  return {
    vehicles, drivers, history, jsonBytes, firestoreDocumentBytes: firestoreBytes,
    documentPath: DOCUMENT, limitBytes: SAFE_DOCUMENT_LIMIT,
    warn, stop, reason, hash, estimator: 'firestore-native-json-preflight-v2',
    liveVerified: false
  };
}

function main() {
  const path = process.argv[2];
  const snap = path
    ? JSON.parse(readFileSync(path, 'utf8'))
    : { vehicles: [{ id: 'v1', history: [{ t: 'atadas' }] }], drivers: [{ id: 'd1' }] };
  const result = analyze(snap);
  console.log(JSON.stringify(result, null, 2));
  if (result.stop) {
    console.error('STOP: Firestore document limit / JSON schema validation risk');
    process.exitCode = 2;
  } else if (result.warn) console.error('WARN: approaching Firestore 1 MiB document limit');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
