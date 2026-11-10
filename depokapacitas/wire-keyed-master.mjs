/**
 * Integration helper for #156.
 * Call this from Depó app.js after seal to replace the operational master
 * used by capacity, eligibility and next-day forecast.
 *
 * Usage sketch inside the existing onSnapshot of flottaSharedState:
 *   if (data.sealed === true) {
 *     const keyed = projectKeyedMasters(driversSnap, vehiclesSnap, data);
 *     if (keyed) {
 *       state.canonicalMaster = keyed;
 *       // booking and capacity now use keyed.drivers / keyed.vehicles
 *     } else {
 *       // fail closed – do not fall back to archived arrays
 *       state.canonicalMaster = { trusted: false, drivers: [], vehicles: [] };
 *     }
 *   }
 */
export { projectKeyedMasters, capacityFromKeyed } from './keyed-live-master.mjs';

export function applyKeyedToState(state, keyed) {
  if (!keyed || !keyed.trusted) {
    state.canonicalMaster = { trusted: false, drivers: [], vehicles: [], source: 'blocked' };
    return false;
  }
  state.canonicalMaster = keyed;
  return true;
}
