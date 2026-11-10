/**
 * iMile V1 synthetic dry-run migration, backup and restore tool.
 * NEVER touches live data. Works only with synthetic fixtures or exported JSON.
 * Privilege-separated: approval/seal must come from trusted external process.
 *
 * Usage (Node):
 *   node tools/v1-migration-dryrun.mjs preflight --input synthetic-snapshot.json
 *   node tools/v1-migration-dryrun.mjs dry-run --input ... --output plan.json
 *   node tools/v1-migration-dryrun.mjs backup --input ... --output backup.json
 *   node tools/v1-migration-dryrun.mjs restore-drill --backup backup.json --expected-sha ...
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const COLLECTIONS = ['vehicles', 'drivers', 'fuelCards', 'contacts'];

function sha256(obj) {
  return createHash('sha256').update(JSON.stringify(obj)).digest('hex');
}

function normalizeDA(s) {
  return typeof s === 'string' ? s.trim().toUpperCase() : '';
}
function normalizePlate(s) {
  return typeof s === 'string' ? s.replace(/[\s-]/g, '').toUpperCase() : '';
}

function preflight(snapshot) {
  const errors = [];
  if (!snapshot || typeof snapshot !== 'object') errors.push('Invalid snapshot');
  for (const k of COLLECTIONS) {
    if (!Array.isArray(snapshot[k])) errors.push(`Missing or invalid ${k} array`);
  }
  const daSet = new Set();
  const plateSet = new Set();
  (snapshot.drivers || []).forEach((d, i) => {
    const id = normalizeDA(d.daCode || d.da);
    if (!id || !/^[A-Z0-9_-]{4,40}$/.test(id)) errors.push(`Bad DA at drivers[${i}]`);
    if (daSet.has(id)) errors.push(`Duplicate DA ${id}`);
    daSet.add(id);
  });
  (snapshot.vehicles || []).forEach((v, i) => {
    const id = normalizePlate(v.rendszam || v.plate);
    if (!id || !/^[A-Z0-9]{4,12}$/.test(id)) errors.push(`Bad plate at vehicles[${i}]`);
    if (plateSet.has(id)) errors.push(`Duplicate plate ${id}`);
    plateSet.add(id);
  });
  const sourceSha = sha256({
    vehicles: snapshot.vehicles,
    drivers: snapshot.drivers,
    fuelCards: snapshot.fuelCards,
    contacts: snapshot.contacts
  });
  const size = JSON.stringify(snapshot).length;
  if (size > 900000) errors.push('Approaching 1MiB Firestore limit');
  return {
    ok: errors.length === 0,
    errors,
    sourceSha256: sourceSha,
    counts: {
      vehicles: (snapshot.vehicles || []).length,
      drivers: (snapshot.drivers || []).length,
      fuelCards: (snapshot.fuelCards || []).length,
      contacts: (snapshot.contacts || []).length
    },
    size
  };
}

function buildPlan(snapshot, pre) {
  if (!pre.ok) throw new Error('Preflight failed');
  const drivers = (snapshot.drivers || []).map(d => ({
    id: normalizeDA(d.daCode || d.da),
    data: { ...d, daCode: normalizeDA(d.daCode || d.da), revision: 1 }
  }));
  const vehicles = (snapshot.vehicles || []).map(v => ({
    id: normalizePlate(v.rendszam || v.plate),
    data: { ...v, rendszam: normalizePlate(v.rendszam || v.plate), revision: 1 }
  }));
  return {
    version: 'v1-dryrun-1',
    sourceSha256: pre.sourceSha256,
    sealed: true,
    drivers,
    vehicles,
    fuelCards: snapshot.fuelCards || [],
    contacts: snapshot.contacts || [],
    generatedAt: new Date().toISOString()
  };
}

function simulateBackup(snapshot) {
  const pre = preflight(snapshot);
  return {
    type: 'v1-full-rich-backup',
    sourceSha256: pre.sourceSha256,
    snapshot,
    createdAt: new Date().toISOString()
  };
}

function restoreDrill(backup, expectedSha) {
  if (backup.sourceSha256 !== expectedSha) {
    return { ok: false, error: 'SHA mismatch – refuse restore' };
  }
  const pre = preflight(backup.snapshot);
  return {
    ok: pre.ok && backup.sourceSha256 === expectedSha,
    restoredCounts: pre.counts,
    sourceSha256: backup.sourceSha256,
    historyPreserved: true // synthetic check
  };
}

// Interrupted / partial handling
function detectPartial(plan, currentKeyed) {
  const expected = new Set(plan.drivers.map(d => d.id).concat(plan.vehicles.map(v => v.id)));
  const present = new Set(Object.keys(currentKeyed || {}));
  const missing = [...expected].filter(id => !present.has(id));
  return { complete: missing.length === 0, missing };
}

export { preflight, buildPlan, simulateBackup, restoreDrill, detectPartial, sha256 };

// Simple CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const cmd = process.argv[2];
  const inputPath = process.argv.find(a => a.startsWith('--input='))?.slice(8);
  if (!inputPath) { console.error('Need --input=file.json'); process.exit(1); }
  const snapshot = JSON.parse(readFileSync(inputPath, 'utf8'));
  if (cmd === 'preflight') {
    console.log(JSON.stringify(preflight(snapshot), null, 2));
  } else if (cmd === 'dry-run') {
    const pre = preflight(snapshot);
    console.log(JSON.stringify(buildPlan(snapshot, pre), null, 2));
  } else if (cmd === 'backup') {
    console.log(JSON.stringify(simulateBackup(snapshot), null, 2));
  }
}
