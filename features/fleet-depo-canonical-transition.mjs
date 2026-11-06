/**
 * iMile V1 – Fleet -> Depot CANONICAL transition planner (NO WRITES).
 *
 * After a separately approved, backed-up migration, the original full Fleet
 * snapshot is the historical source of truth. Strict Depot /drivers and
 * /vehicles are normalized projections; they MUST never diverge.
 *
 * This deterministic planner validates an old and proposed full Fleet
 * snapshot against the existing server-confirmed Depot masters. It produces
 * a small set of proposed atomic writes, but intentionally does not import,
 * write, authenticate or deploy anything. An eventual transaction adapter
 * must re-read/validate every affected server document INSIDE the transaction.
 *
 * It is NOT a GO signal or a replacement for live migration/Rules approval.
 */
import {planSharedMigration} from './shared-master-adapter.mjs';

const CORE={
  drivers:['name','daCode','vendor','capacity','active'],
  vehicles:['plate','model','status']
};
const activeBooking=b=>b?.status==='planned'||b?.status==='confirmed';
const error=(issues,kind,reason)=>issues.push({kind,reason});
const strictEqualFields=(a,b,fields)=>{
  if(!a||!b||typeof a!=='object'||typeof b!=='object')return false;
  if(Object.keys(a).length!==fields.length)return false;
  return fields.every(k=>Object.prototype.hasOwnProperty.call(a,k)&&Object.is(a[k],b[k]));
};
function indexProjected(rows,kind,issues){
  const output=new Map();
  if(!Array.isArray(rows)){error(issues,kind,'invalid_projection');return output;}
  for(const item of rows){
    if(!item||typeof item.id!=='string'||!item.id||!item.data||output.has(item.id)){
      error(issues,kind,'duplicate_or_invalid_fleet_id');continue;
    }
    output.set(item.id,item.data);
  }
  return output;
}
function indexActual(rows,kind,issues){
  const output=new Map();
  if(!Array.isArray(rows)){error(issues,kind,'unconfirmed_master_collection');return output;}
  for(const row of rows){
    if(!row||typeof row.id!=='string'||!row.id||output.has(row.id)){
      error(issues,kind,'duplicate_or_invalid_depot_id');continue;
    }
    const data={...row};delete data.id;
    output.set(row.id,data);
  }
  return output;
}

export function planCanonicalMasterTransition({
  previousFleet,nextFleet,liveDrivers,liveVehicles,bookings,maxWrites=8
}={}){
  const issues=[],writes=[];
  if(!previousFleet||!Number.isSafeInteger(previousFleet.revision)||previousFleet.revision<1){
    return {ready:false,dryRun:true,writes:[],issues:[{kind:'fleet',reason:'unverified_previous_revision'}]};
  }
  if(!Array.isArray(bookings)){
    return {ready:false,dryRun:true,writes:[],issues:[{kind:'bookings',reason:'unconfirmed_booking_collection'}]};
  }
  if(!Number.isSafeInteger(maxWrites)||maxWrites<1||maxWrites>20)
    return {ready:false,dryRun:true,writes:[],issues:[{kind:'policy',reason:'invalid_transaction_budget'}]};

  let before,after;
  try{
    before=planSharedMigration(previousFleet);
    after=planSharedMigration(nextFleet);
  }catch(_){
    return {ready:false,dryRun:true,writes:[],issues:[{kind:'fleet',reason:'invalid_complete_snapshot'}]};
  }
  if(!before.ready||!after.ready||
     [...before.writes.drivers,...before.writes.vehicles,...after.writes.drivers,...after.writes.vehicles]
       .some(row=>!row||!row.data)){
    return {ready:false,dryRun:true,writes:[],
      issues:[{kind:'fleet',reason:'duplicate_or_invalid_master_projection'}]};
  }

  for(const [kind,prevRows,nextRows,liveRows] of [
    ['drivers',before.writes.drivers,after.writes.drivers,liveDrivers],
    ['vehicles',before.writes.vehicles,after.writes.vehicles,liveVehicles]
  ]){
    const prev=indexProjected(prevRows,kind,issues);
    const next=indexProjected(nextRows,kind,issues);
    const actual=indexActual(liveRows,kind,issues);
    // A correct migration must be proved BEFORE treating the Depot
    // collection as an authoritative reflection of the original Fleet.
    if(prev.size!==actual.size)
      error(issues,kind,'fleet_depot_record_count_drift');
    for(const [id,oldFields]of prev){
      const live=actual.get(id);
      if(!strictEqualFields(live,oldFields,CORE[kind]))
        error(issues,kind,'fleet_depot_existing_master_drift');
      if(!next.has(id))
        error(issues,kind,'original_fleet_master_deletion_requires_manual_migration');
    }
    for(const id of actual.keys())
      if(!prev.has(id))error(issues,kind,'depot_only_master_requires_review');

    for(const [id,newFields]of next){
      const previous=prev.get(id);
      const changed=previous&&!CORE[kind].every(f=>Object.is(previous[f],newFields[f]));
      if(!previous || changed){
        if(previous){
          const bookingAtRisk=bookings.some(b=>activeBooking(b)&&
            (kind==='drivers'?b.driverId===id:b.vehicleId===id));
          if(bookingAtRisk && (kind==='drivers'?newFields.active!==true:
              newFields.status!=='Elérhető')){
            error(issues,kind,'existing_booking_would_lose_eligible_master');
          }
        }
        writes.push({
          collection:kind,id,operation:previous?'update':'create',
          expectedPrevious:previous||null,proposed:newFields
        });
      }
    }
  }

  if(writes.length>maxWrites)
    error(issues,'transaction','too_many_atomic_master_writes');
  if(issues.length)return {
    ready:false,dryRun:true,writes:[],issues,
    counts:{proposed:writes.length,applied:0}
  };
  return {
    ready:true,dryRun:true,liveVerified:false,writes,
    issues:[],beforeRevision:previousFleet.revision,
    proposedRevision:previousFleet.revision+1,
    counts:{
      proposed:writes.length,creates:writes.filter(x=>x.operation==='create').length,
      updates:writes.filter(x=>x.operation==='update').length,applied:0
    },
    notice:'DRY-RUN ONLY: a transaction must re-read Fleet, affected Depot masters and server approval; no writes made'
  };
}
