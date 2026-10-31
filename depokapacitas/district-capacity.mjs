/**
 * DepóKapacitás staging: conservative daily district capacity calculation.
 * Aggregate New/Retry figures do NOT prove parcel-level uniqueness.
 * No Firebase or external sheet access; reads supplied snapshots only.
 */
import {assessBooking} from './capacity-eligibility.mjs';

const district=v=>String(v??'').trim().toLocaleUpperCase('hu-HU').replaceAll('/','-');
const validCount=v=>Number.isSafeInteger(v)&&v>=0&&v<=10000000;
const add=(map,key,value)=>map.set(key,(map.get(key)||0)+value);
const validDate=v=>/^20\d\d-\d\d-\d\d$/.test(String(v))&&
  new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;

/**
 * Verify a parcel-level daily manifest before using it to replace manually
 * reported aggregates. Every parcel must have a unique stable tracking ID.
 * Duplicate rows may be identical repeats (counted once), but conflicts make
 * the whole source unverified. No "best guess" between new and retry.
 */
export function verifyParcelDemand(rows,{date}={}){
  if(!validDate(date))throw Error('Érvénytelen munkanap.');
  if(!Array.isArray(rows))throw Error('Hiányzik a csomaglista.');
  const selected=rows.filter(x=>x?.date===date);
  const byId=new Map(),issues=[];
  for(const [i,row] of selected.entries()){
    const id=String(row.trackingId??'').trim().toUpperCase();
    const area=district(row.district);
    const kind=String(row.kind??'').trim().toLowerCase();
    if(!id||id.length>100||!area||!['new','retry'].includes(kind)){
      issues.push({reason:'invalid_parcel',line:i+1});continue;
    }
    const old=byId.get(id);
    if(old){
      if(old.district!==area||old.kind!==kind)
        issues.push({reason:'conflicting_parcel',trackingId:id});
      else issues.push({reason:'duplicate_parcel',trackingId:id});
      continue;
    }
    byId.set(id,{district:area,kind});
  }
  const counts=new Map();
  for(const p of byId.values()){
    if(!counts.has(p.district))counts.set(p.district,{district:p.district,newCount:0,retryCount:0});
    counts.get(p.district)[p.kind==='new'?'newCount':'retryCount']++;
  }
  return {verified:selected.length>0&&!issues.some(x=>x.reason!=='duplicate_parcel'),
    hasRecords:selected.length>0,uniqueCount:byId.size,
    districts:[...counts.values()].sort((a,b)=>a.district.localeCompare(b.district,'hu')),
    issues};
}

/** Never double count a courier or a car booked twice in a day.
 * Ambiguous allocations are excluded rather than arbitrarily assigning them.
 */
export function summarizeDistrictCapacity({date,demands=[],bookings=[],drivers=[],vehicles=[],today=date}={}){
  if(!validDate(date)||!validDate(today))throw Error('Érvénytelen dátum.');
  const relevantDemands=demands.filter(x=>x.date===date);
  const relevantBookings=bookings.filter(x=>x.date===date);
  const byDistrict=new Map(),issues=[];
  const ensure=key=>{
    if(!byDistrict.has(key))byDistrict.set(key,{district:key,newCount:null,retryCount:null,
      demand:null,capacity:0,gap:null,excludedBookings:0,hasDemand:false});
    return byDistrict.get(key);
  };
  const demandGroups=new Map();
  for(const d of relevantDemands){
    const key=district(d.district);
    if(!key){issues.push({reason:'invalid_district',id:d.id??null});continue;}
    if(!demandGroups.has(key))demandGroups.set(key,[]);
    demandGroups.get(key).push(d);ensure(key);
  }
  for(const [key,arr] of demandGroups){
    const target=ensure(key);
    if(arr.length!==1){issues.push({reason:'duplicate_district_demand',district:key});continue;}
    const d=arr[0];
    if(!validCount(d.newCount)||!validCount(d.retryCount)||
      d.newCount+d.retryCount>10000000){
      issues.push({reason:'invalid_demand_count',district:key});continue;
    }
    Object.assign(target,{newCount:d.newCount,retryCount:d.retryCount,
      demand:d.newCount+d.retryCount,hasDemand:true});
  }
  const driverUse=new Map(),carUse=new Map();
  for(const b of relevantBookings){
    if(b.driverId)add(driverUse,b.driverId,1);
    if(b.vehicleId)add(carUse,b.vehicleId,1);
  }
  for(const b of relevantBookings){
    const key=district(b.district);
    if(!key){issues.push({reason:'booking_without_district',id:b.id??null});continue;}
    const target=ensure(key);
    let reason='';
    if(!b.driverId||!b.vehicleId)reason='missing_assignment';
    else if(driverUse.get(b.driverId)>1||carUse.get(b.vehicleId)>1)reason='duplicate_assignment';
    else if(!assessBooking(b,drivers,vehicles,today).eligible)reason='unavailable_assignment';
    else if(!validCount(b.capacity)||b.capacity>10000)reason='invalid_capacity';
    if(reason){target.excludedBookings++;issues.push({reason,id:b.id??null,district:key});continue;}
    target.capacity+=b.capacity;
  }
  const rows=[...byDistrict.values()].sort((a,b)=>a.district.localeCompare(b.district,'hu'));
  for(const row of rows)if(row.hasDemand)row.gap=row.capacity-row.demand;
  const complete=rows.length>0&&rows.every(x=>x.hasDemand)&&
    !issues.some(x=>['invalid_district','booking_without_district'].includes(x.reason));
  const totalCapacity=rows.reduce((n,x)=>n+x.capacity,0);
  const totalNew=rows.reduce((n,x)=>n+(x.newCount??0),0);
  const totalRetry=rows.reduce((n,x)=>n+(x.retryCount??0),0);
  return {date,rows,issues,totalCapacity,totalNew,totalRetry,
    totalDemand:complete?totalNew+totalRetry:null,
    gap:complete?totalCapacity-totalNew-totalRetry:null,
    hasCompleteDemand:complete,excludedBookings:rows.reduce((n,x)=>n+x.excludedBookings,0),
    parcelsVerified:false};
}
