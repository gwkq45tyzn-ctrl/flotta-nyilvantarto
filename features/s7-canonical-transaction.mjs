/**
 * S7 canonical transaction simulator (PURE, NO WRITES).
 *
 * The full original Fleet snapshot is the single source of truth.
 * Strict Depot /drivers and /vehicles are projections that must never
 * diverge from the Fleet projection. Rich history, fuel cards, contacts,
 * insurance and service stay only in the Fleet snapshot (or private backup).
 *
 * This module simulates the atomic check-and-apply that a real Firestore
 * transaction must perform. It does not import, write, or deploy anything.
 */
import { planCanonicalMasterTransition } from './fleet-depo-canonical-transition.mjs';

export function simulateCanonicalApply({
  previousFleet, nextFleet, liveDrivers, liveVehicles, bookings,
  offline = false, authorized = true
} = {}) {
  if (offline) {
    return { applied: false, reason: 'offline', writes: [], issues: [{ kind: 'client', reason: 'offline_write_refused' }] };
  }
  if (!authorized) {
    return { applied: false, reason: 'unauthorized', writes: [], issues: [{ kind: 'auth', reason: 'unauthorized' }] };
  }
  const plan = planCanonicalMasterTransition({
    previousFleet, nextFleet, liveDrivers, liveVehicles, bookings
  });
  if (!plan.ready) {
    return { applied: false, reason: 'plan_rejected', writes: [], issues: plan.issues };
  }
  // Simulate the server re-read inside the transaction: if live state
  // no longer matches the previous projection, abort.
  return {
    applied: true,
    reason: 'ok',
    writes: plan.writes,
    issues: [],
    nextRevision: (previousFleet.revision || 0) + 1
  };
}

export function protectActiveBookings(bookings, proposedVehicleIds) {
  const blocked = [];
  for (const b of bookings || []) {
    if (b && (b.status === 'planned' || b.status === 'confirmed') &&
        proposedVehicleIds.includes(b.vehicleId)) {
      blocked.push(b.id || b.vehicleId);
    }
  }
  return blocked;
}
