/**
 * S7 canonical transition DRY-RUN (pure, no I/O, NO writes).
 *
 * A proposed transition MUST NOT say "applied" simply because validation
 * passed. This module only models the checks a future Firestore transaction
 * should perform with real, server-read documents INSIDE that transaction.
 *
 * The full original Fleet snapshot remains authoritative; strict Depot
 * /vehicles and /drivers documents are derived projections.
 */
import {planCanonicalMasterTransition} from './fleet-depo-canonical-transition.mjs';
import {canonical} from './migration-size-probe.mjs';

const active=b=>b?.status==='planned'||b?.status==='confirmed';
const blocked=(reason, issues=[])=>({
  applied:false,dryRun:true,simulatedReady:false,actualWrites:0,
  reason,writes:[],proposedWrites:[],issues,
  serverVerified:false,liveVerified:false
});

export function protectActiveBookings(bookings,proposedVehicleIds){
  if(!Array.isArray(bookings)||!Array.isArray(proposedVehicleIds))return [];
  const ids=new Set(proposedVehicleIds);
  return bookings.filter(b=>b&&active(b)&&ids.has(b.vehicleId))
    .map(b=>b.id||b.vehicleId);
}

/**
 * The caller MUST provide an explicit offline=false, authorized=true, plus a
 * synthetic observedFleet. Those flags/fixtures are NOT permission or server
 * verification. No result returned by this function is a committed save.
 */
export function simulateCanonicalApply({
  previousFleet,nextFleet,observedFleet,liveDrivers,liveVehicles,bookings,
  offline,authorized
}={}){
  if(offline!==false) return blocked(
    offline===true?'offline':'connectivity_not_verified',
    [{kind:'client',reason:'offline_or_unverified'}]);
  if(authorized!==true)return blocked('unauthorized',
    [{kind:'auth',reason:'authorization_not_verified'}]);
  if(!previousFleet||!observedFleet)return blocked('server_snapshot_unverified',
    [{kind:'fleet',reason:'missing_observed_fleet'}]);

  // Compared IN MEMORY here; the eventual real adapter must repeat this on
  // true server-fetched values inside Firestore runTransaction.
  try{
    if(canonical(previousFleet)!==canonical(observedFleet))
      return blocked('stale_server_snapshot',
        [{kind:'fleet',reason:'observed_fleet_changed'}]);
  }catch(_){
    return blocked('invalid_snapshot',
      [{kind:'fleet',reason:'noncanonical_snapshot'}]);
  }

  if(!nextFleet||!Number.isSafeInteger(previousFleet.revision)||
      previousFleet.revision<1||nextFleet.revision!==previousFleet.revision)
    return blocked('revision_mismatch',
      [{kind:'fleet',reason:'stale_proposed_revision'}]);

  const plan=planCanonicalMasterTransition({
    previousFleet,nextFleet,liveDrivers,liveVehicles,bookings
  });
  if(!plan.ready)return blocked('plan_rejected',plan.issues);

  // Conservatively freeze any normalized master change while an outstanding
  // planned/confirmed booking references the vehicle/driver. History-only
  // changes do not change normalized master records.
  const vehicleIds=plan.writes.filter(w=>w.collection==='vehicles').map(w=>w.id);
  const driverIds=new Set(plan.writes.filter(w=>w.collection==='drivers').map(w=>w.id));
  const blockedVehicles=protectActiveBookings(bookings,vehicleIds);
  const blockedDrivers=bookings.filter(b=>b&&active(b)&&driverIds.has(b.driverId))
    .map(b=>b.id||b.driverId);
  if(blockedVehicles.length||blockedDrivers.length)
    return blocked('active_booking_conflict',[{
      kind:'bookings',reason:'master_has_active_booking',
      count:blockedVehicles.length+blockedDrivers.length
    }]);

  // These are *proposals*, not operations performed. There is no Firestore
  // transaction nor server confirmation in this pure module.
  return {
    applied:false,dryRun:true,simulatedReady:true,actualWrites:0,
    reason:'dry_run_only',writes:[],proposedWrites:plan.writes,
    issues:[],nextRevisionCandidate:plan.proposedRevision,
    serverVerified:false,liveVerified:false,
    notice:'DRY-RUN ONLY: no update was executed. Transaction/Roles/Rules and true server re-read are still required.'
  };
}
