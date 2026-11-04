/**
 * S7 SINGLE-SOURCE Depot master list from the complete ORIGINAL Fleet.
 *
 * Depot /drivers and /vehicles are treated as verification-only mirrors:
 * never as an independent source of available drivers/cars. Only a fully
 * server-confirmed migration approval AND a complete matching Fleet state
 * permits presentation as available operational master data.
 *
 * Pure, no Firebase, writes, browser APIs, private sidecar in output.
 * This is NOT proof of an approved real migration or deploy.
 */
import {planSharedMigration} from '../features/shared-master-adapter.mjs';
import {planCanonicalMasterTransition} from '../features/fleet-depo-canonical-transition.mjs';

const SOURCE_IDS=['drivers','vehicles','flottaSharedState','flottaMigrationApproval'];
const SHA=/^[a-f0-9]{64}$/;
const blocked=(reason,issues=[])=>({
  trusted:false,status:'blocked',reason,issues,
  drivers:[],vehicles:[],revision:null,
  source:'original-fleet-only',liveVerified:false
});

export function assessCanonicalMasterDisplay({
  fleet,approval,uid,driverMirrors,vehicleMirrors,sourceMeta,
  online=true,now=Date.now(),maxAgeMs=15*60_000
}={}){
  if(online!==true)return blocked('offline');
  if(!uid||!approval||approval.status!=='approved'||
     approval.approvedUid!==uid||!SHA.test(approval.sourceSha256||''))
    return blocked('unapproved_migration');
  if(!fleet||!Number.isSafeInteger(fleet.revision)||fleet.revision<1||
     fleet.migrationSourceSha256!==approval.sourceSha256)
    return blocked('original_fleet_source_not_attested');

  for(const name of SOURCE_IDS){
    const meta=sourceMeta?.[name];
    if(!meta||meta.loaded!==true||meta.error===true||
       meta.fromCache!==false||meta.pending!==false||
       !Number.isFinite(meta.serverAt)||meta.serverAt<=0||
       meta.serverAt>now||now-meta.serverAt>maxAgeMs)
      return blocked('unconfirmed_or_stale_source_'+name);
  }

  const plan=planCanonicalMasterTransition({
    previousFleet:fleet,nextFleet:fleet,
    liveDrivers:driverMirrors,liveVehicles:vehicleMirrors,bookings:[]
  });
  if(!plan.ready)return blocked('depot_mirror_drift',
    (plan.issues||[]).slice(0,10).map(i=>({kind:i.kind,reason:i.reason})));
  let projected;
  try{projected=planSharedMigration(fleet);}
  catch(_){return blocked('invalid_original_fleet_structure');}
  if(!projected.ready||
     projected.writes.drivers.some(x=>!x)||
     projected.writes.vehicles.some(x=>!x))
    return blocked('invalid_original_fleet_master');

  // Drop ALL rich original Fleet sidecars: lists contain strict fields only.
  const drivers=projected.writes.drivers.map(x=>({id:x.id,...x.data}));
  const vehicles=projected.writes.vehicles.map(x=>({id:x.id,...x.data}));
  return {
    trusted:true,status:'ready',reason:null,issues:[],
    drivers,vehicles,revision:fleet.revision,
    source:'original-fleet-only',
    liveVerified:false,
    notice:'Server-confirmed synthetic/client parity; requires separately authorized live migration and immutable Rules before GO'
  };
}
