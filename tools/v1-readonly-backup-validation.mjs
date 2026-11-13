/**
 * Read-only local validation for a full four-block Flotta backup.
 * Does not assume a fixed record count. Checks history, identifiers and structure.
 * Synthetic only. Never writes.
 */
import {sha256} from './v1-migration-dryrun.mjs';

export function validateBackup(raw) {
  if (!raw || typeof raw !== 'object') return {ok: false, reason: 'INVALID_BACKUP'};
  const blocks = ['drivers', 'vehicles', 'fuelCards', 'contacts'];
  const issues = [];
  for (const b of blocks) {
    if (!Array.isArray(raw[b])) issues.push('MISSING_OR_INVALID_BLOCK:' + b);
  }
  if (issues.length) return {ok: false, issues};

  const driverIds = new Set();
  const vehicleIds = new Set();
  for (const d of raw.drivers) {
    if (!d || typeof d !== 'object' || !d.daCode || !Array.isArray(d.history))
      issues.push('INVALID_DRIVER:' + (d?.daCode || 'unknown'));
    else if (driverIds.has(d.daCode)) issues.push('DUPLICATE_DRIVER:' + d.daCode);
    else driverIds.add(d.daCode);
  }
  for (const v of raw.vehicles) {
    if (!v || typeof v !== 'object' || !v.rendszam || !Array.isArray(v.history))
      issues.push('INVALID_VEHICLE:' + (v?.rendszam || 'unknown'));
    else if (vehicleIds.has(v.rendszam)) issues.push('DUPLICATE_VEHICLE:' + v.rendszam);
    else vehicleIds.add(v.rendszam);
  }
  return {
    ok: issues.length === 0,
    issues,
    driverCount: raw.drivers.length,
    vehicleCount: raw.vehicles.length,
    fuelCardCount: raw.fuelCards.length,
    contactCount: raw.contacts.length,
    sourceSha256: sha256(raw),
    sealed: false
  };
}
