/**
 * Privacy-safe ORIGINAL four-array Fleet source validation (read-only).
 * Reuses the real migration preflight instead of maintaining a weaker
 * exact-string DA/plate duplicate check. Neither result authorizes import.
 */
import {preflight} from './v1-migration-dryrun.mjs';

const validDriverStatuses=new Set(['aktiv','aktív','inaktiv','inaktív']);
const validVehicleStatuses=new Set(['aktiv','aktív','szerviz','leállított','leallitott']);
const asRows=(obj,k)=>Array.isArray(obj?.[k])?obj[k]:[];
const own=(v,k)=>v!==null&&typeof v==='object'&&Object.prototype.hasOwnProperty.call(v,k);
const capacityValid=d=>{
  const raw=d?.kapacitas??d?.capacity;
  if(raw===null||raw===undefined||(typeof raw==='string'&&!raw.trim()))return false;
  const n=Number(raw);
  return Number.isSafeInteger(n)&&n>=0&&n<=10000;
};
const normStatus=x=>typeof x==='string'?x.trim().toLowerCase():'';

/** The source preflight can include original identifiers in diagnostics.
 * Do NOT copy its error strings to GitHub, screenshots, issue comments or
 * console logs. Expose only category/count-level codes.
 */
function codeFor(error){
  const s=String(error);
  if(s.includes('Missing or invalid '))return 'MISSING_OR_INVALID_BLOCK';
  if(s.includes('Duplicate DA'))return 'DUPLICATE_DRIVER';
  if(s.includes('Duplicate plate'))return 'DUPLICATE_VEHICLE';
  if(s.includes('Bad DA'))return 'INVALID_DRIVER_IDENTITY';
  if(s.includes('Bad plate'))return 'INVALID_VEHICLE_IDENTITY';
  if(s.includes('Duplicate')||s.includes('duplicate'))return 'DUPLICATE_INTERNAL_ID';
  if(s.includes('sourceIndex'))return 'UNTRUSTED_SOURCE_INDEX';
  if(s.includes('history'))return 'INVALID_HISTORY';
  if(s.includes('record')||s.includes('internal record ID'))return 'INVALID_RICH_RECORD';
  if(s.includes('JSON')||s.includes('Source is not strict'))return 'INVALID_SOURCE_JSON';
  if(s.includes('budget')||s.includes('size'))return 'SOURCE_SIZE_REQUIRES_REVIEW';
  return 'SOURCE_REQUIRES_REVIEW';
}

export function validateBackup(raw){
  const source=preflight(raw); // Real original migration code: normalization, SHA, rich records
  const drivers=asRows(raw,'drivers'),vehicles=asRows(raw,'vehicles');
  const counts=source.counts;
  const issues=[...new Set(source.errors.map(codeFor))];
  const warnings={
    // An omitted history property means no recorded history, NOT a reason to
    // discard the record. Explicit malformed history is a structural error.
    driversWithoutHistory:drivers.filter(d=>!own(d,'history')).length,
    vehiclesWithoutHistory:vehicles.filter(v=>!own(v,'history')).length,
    driversMissingOrInvalidDailyCapacity:drivers.filter(d=>!capacityValid(d)).length,
    driversWithUnknownStatus:drivers.filter(d=>!validDriverStatuses.has(normStatus(d?.status))).length,
    vehiclesWithUnknownStatus:vehicles.filter(v=>!validVehicleStatuses.has(normStatus(v?.status))).length
  };
  const operationalReady=source.ok
    && warnings.driversMissingOrInvalidDailyCapacity===0
    && warnings.driversWithUnknownStatus===0
    && warnings.vehiclesWithUnknownStatus===0;
  return Object.freeze({
    ok:source.ok, issues,
    driverCount:counts.drivers,vehicleCount:counts.vehicles,
    fuelCardCount:counts.fuelCards,contactCount:counts.contacts,
    sourceSha256:source.sourceSha256,
    warnings,operationalReady,
    requiresFirestoreEncodedSizeCheck:true,
    sealed:false,canSeal:false,authorizedForImport:false,
    liveSourceAuthorityVerified:false,productionIamVerified:false
  });
}
