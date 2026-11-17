/**
 * Phase-1 Fleet+Depot OPERATIONAL preflight on a local raw rich Fleet source.
 * Complements cryptographic/identity checks: a perfectly preserved source
 * can still be unusable if active courier capacity was never collected.
 *
 * Privacy: no names, phone numbers, DA codes or plates in the result.
 * This does not inspect live Firebase, grant IAM rights, seal or deploy.
 */
import {assessAtomicMigrationBudget} from './v1-atomic-migration-budget.mjs';
export const MAX_PHASE1_DRIVER_ROWS=30; // proven current 20+10 split on original Rules; no production IAM GO
const active=s=>typeof s==='string'&&['aktiv','aktív'].includes(s.trim().toLowerCase());
const unknown=s=>typeof s!=='string'||![
  'aktiv','aktív','inaktiv','inaktív'
].includes(s.trim().toLowerCase());

export function assessFleetDepotOperationalReadiness(source){
  const reasons=[],warnings=[];
  if(!source||typeof source!=='object'||Array.isArray(source)||
     !Array.isArray(source.drivers)||!Array.isArray(source.vehicles))
    return {ready:false,reasons:['INVALID_SOURCE_ARRAYS'],warnings:[],
      counts:{drivers:0,vehicles:0,activeDrivers:0,activeVehicles:0,
        activeWithoutCapacity:0,uncertainDriverStatuses:0},
      authorizedForImport:false,ownerApprovalVerified:false};
  const drivers=source.drivers,vehicles=source.vehicles;
  const migration=assessAtomicMigrationBudget({
    drivers:drivers.length,vehicles:vehicles.length
  });
  if(!migration.withinProvenReadBound)
    reasons.push('PHASE1_ATOMIC_MIGRATION_READ_BOUND_EXCEEDED');
  const activeDrivers=drivers.filter(d=>d&&active(d.status));
  const activeVehicles=vehicles.filter(v=>v&&active(v.status));
  const activeWithoutCapacity=activeDrivers.filter(d=>
    !Number.isSafeInteger(d.kapacitas)||d.kapacitas<1||d.kapacitas>10000).length;
  const uncertainDriverStatuses=drivers.filter(d=>!d||unknown(d.status)).length;
  if(drivers.length>MAX_PHASE1_DRIVER_ROWS)
    reasons.push('PHASE1_RULES_DRIVER_LIMIT_EXCEEDED');
  if(activeDrivers.length===0)reasons.push('NO_ACTIVE_DRIVERS');
  if(activeVehicles.length===0)reasons.push('NO_ACTIVE_VEHICLES');
  if(activeWithoutCapacity>0)
    reasons.push('ACTIVE_DRIVER_CAPACITY_UNSET_OR_INVALID');
  if(uncertainDriverStatuses>0){
    warnings.push('DRIVER_STATUS_NEEDS_OWNER_REVIEW');
    reasons.push('DRIVER_STATUS_NEEDS_OWNER_REVIEW');
  }
  return {
    ready:reasons.length===0,
    reasons,warnings,
    counts:{drivers:drivers.length,vehicles:vehicles.length,
      activeDrivers:activeDrivers.length,activeVehicles:activeVehicles.length,
      activeWithoutCapacity,uncertainDriverStatuses,
      keyedPairs:migration.keyedPairs,
      receiptDocuments:migration.receiptDocuments,
      ownedReadDocuments:migration.ownedReadDocuments,
      maxAtomicOwnedReadDocuments:migration.maxAtomicOwnedReadDocuments,
      withinAtomicReadBound:migration.withinProvenReadBound},
    // Local data quality is NEVER a production release authorization.
    authorizedForImport:false,ownerApprovalVerified:false
  };
}
