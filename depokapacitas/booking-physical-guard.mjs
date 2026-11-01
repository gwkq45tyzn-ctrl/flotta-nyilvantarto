/**
 * DepóKapacitás staging: local, read-only booking guard for manual Fleet
 * checkouts and open Mobile Attendance usages.
 *
 * This is a UI/transaction preflight, NOT server-enforced authorization:
 * Security Rules must also implement atomic booking-vs-checkout protection
 * before release. Future-day plans are not auto-blocked by today's checkout.
 */
const REQUIRED=['drivers','vehicles','bookings','fleetAssignments','attendance'];
const canon=v=>String(v??'').trim().toUpperCase().replace(/[\s-]+/g,'');
export function bookingSourcesTrusted(meta,{online=true,now=Date.now(),maxAge=15*60*1000}={}){
 if(!online)return false;
 return REQUIRED.every(key=>{
  const src=meta?.[key];
  return src?.loaded===true&&src?.error!==true&&src.fromCache===false&&
   src.pending===false&&Number.isFinite(src.serverAt)&&src.serverAt>0&&
   now>=src.serverAt&&now-src.serverAt<=maxAge;
 });
}
export function assessDailyPhysicalUse({date,today,driverId,vehicleId,assignments,handovers}={}){
 if(typeof date!=='string'||typeof today!=='string'||!/^\d{4}-\d\d-\d\d$/.test(date)||
  !/^\d{4}-\d\d-\d\d$/.test(today)||!canon(driverId)||!canon(vehicleId))
  return Object.freeze({eligible:false,reason:'invalid_input'});
 if(!Array.isArray(assignments)||!Array.isArray(handovers))
  return Object.freeze({eligible:false,reason:'unverified_physical_sources'});
 // The current checkout does not automatically reserve *all future days*.
 if(date>today)return Object.freeze({eligible:true,reason:'future_plan_not_physically_verified'});
 if(date<today)return Object.freeze({eligible:false,reason:'historical_booking_disallowed'});
 const da=canon(driverId),car=canon(vehicleId);
 const activeManual=assignments.filter(a=>a?.active===true);
 for(const a of activeManual){
  const assignedDa=canon(a.driverId),assignedCar=canon(a.vehicleId);
  if((assignedCar===car&&assignedDa!==da)||(assignedDa===da&&assignedCar!==car))
   return Object.freeze({eligible:false,reason:'manual_checkout_conflict'});
  if((assignedCar===car||assignedDa===da)&&(!assignedCar||!assignedDa))
   return Object.freeze({eligible:false,reason:'invalid_manual_checkout'});
 }
 for(const a of handovers.filter(h=>h?.status==='issued'||h?.status==='return_review')){
  const assignedDa=canon(a.driverId),assignedCar=canon(a.vehicleId);
  if((assignedCar===car&&assignedDa!==da)||(assignedDa===da&&assignedCar!==car))
   return Object.freeze({eligible:false,reason:'attendance_checkout_conflict'});
  if((assignedCar===car||assignedDa===da)&&(!assignedCar||!assignedDa))
   return Object.freeze({eligible:false,reason:'invalid_attendance_checkout'});
 }
 return Object.freeze({eligible:true,reason:'no_known_conflict'});
}
