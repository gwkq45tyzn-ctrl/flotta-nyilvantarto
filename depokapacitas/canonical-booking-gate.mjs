/**
 * Fail-closed V1 original Fleet -> Depot booking master parity check.
 *
 * PURE: no network, Firebase or state modifications. A caller must supply
 * fresh server documents obtained INSIDE its booking Firestore transaction.
 * Never trust separately mirrored /drivers and /vehicles merely by ID.
 *
 * This protects the *selected* booking master references only, not the
 * entire Fleet/Depot cutover. The latter remains an independently gated GO.
 */
import {planSharedMigration} from '../features/shared-master-adapter.mjs';

const SHA=/^[a-f0-9]{64}$/;
const strictEquals=(received,expected)=>{
  if(!received||!expected||typeof received!=='object'||Array.isArray(received))
    return false;
  const keys=Object.keys(expected);
  return Object.keys(received).length===keys.length &&
    keys.every(k=>Object.prototype.hasOwnProperty.call(received,k)&&
      Object.is(received[k],expected[k]));
};
const blocked=(code)=>({ready:false,code});

export function assessCanonicalBookingMaster({
  fleet,approval,uid,driverId,vehicleId,depotDriver,depotVehicle,
  expectedFleetRevision
}={}){
  if(!uid||!SHA.test(approval?.sourceSha256||'')||
      approval?.status!=='approved'||approval?.approvedUid!==uid)
    return blocked('no_server_migration_approval');
  // These are the metadata written by a later, privileged, proven import.
  // A syntactically valid SHA in a policy alone is NOT proof of a restored
  // Fleet source; the document must carry that exact immutable source id.
  if(!fleet||!Number.isSafeInteger(fleet.revision)||fleet.revision<1||
     fleet.migrationSourceSha256!==approval.sourceSha256)
    return blocked('fleet_source_not_attested');
  if(expectedFleetRevision!==undefined&&
     fleet.revision!==expectedFleetRevision)
    return blocked('fleet_revision_changed');
  let plan;
  try{plan=planSharedMigration(fleet);}
  catch(_){return blocked('invalid_full_fleet_snapshot');}
  if(!plan.ready||plan.writes.drivers.some(w=>!w)||
      plan.writes.vehicles.some(w=>!w))
    return blocked('invalid_canonical_master_projection');

  const driver=plan.writes.drivers.find(x=>x.id===driverId);
  const vehicle=plan.writes.vehicles.find(x=>x.id===vehicleId);
  if(!driver||!vehicle)return blocked('booking_master_not_in_original_fleet');
  if(!depotDriver||depotDriver.id!==driverId||
     !strictEquals(Object.fromEntries(
       Object.entries(depotDriver).filter(([k])=>k!=='id')),driver.data))
    return blocked('driver_depot_projection_drift');
  if(!depotVehicle||depotVehicle.id!==vehicleId||
     !strictEquals(Object.fromEntries(
       Object.entries(depotVehicle).filter(([k])=>k!=='id')),vehicle.data))
    return blocked('vehicle_depot_projection_drift');
  if(driver.data.active!==true||vehicle.data.status!=='Elérhető')
    return blocked('ineligible_fleet_master');

  return {
    ready:true,code:'server_read_parity_ready',
    fleetRevision:fleet.revision,driverId,vehicleId,
    notice:'PARITY ONLY. The caller must complete a real Firestore transaction; no booking has been saved by this function.'
  };
}
