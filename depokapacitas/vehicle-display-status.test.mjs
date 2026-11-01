import assert from 'node:assert/strict';
import {test} from 'node:test';
import {vehicleDisplayStatus as show} from './vehicle-display-status.mjs';
const today='2026-11-02',date=today,vehicleStatus='Elérhető';
const status=changes=>show({today,date,vehicleStatus,...changes});
const expect=(changes,text,reason)=>{
 const r=status(changes);
 assert.deepEqual(r,{text,reason});
 assert.equal(Object.isFrozen(r),true);
};
test('verified current-day car may say bookable, but this is never a write grant',()=>{
 expect({occupancy:{eligible:true,reason:'clear'}},'Foglalható','verified_current_day');
});
test('missing/stale Attendance or untrusted source never shows Szabad',()=>{
 expect({occupancy:{eligible:false,reason:'attendance_guard_missing_or_stale'}},
  'Nincs hiteles jelenlétadat','attendance_unverified');
 expect({occupancy:{eligible:false,reason:'unconfirmed_sources'}},
  'Nem ellenőrzött','unconfirmed_sources');
 expect({occupancy:null},'Nem foglalható','unknown_source');
});
test('active issued manual or Attendance car is not called available',()=>{
 expect({occupancy:{eligible:false,reason:'physical_other_driver'}},
  'Fizikailag kiadva','physical_issued');
 expect({occupancy:{eligible:false,reason:'attendance_other_driver'}},
  'Fizikailag kiadva','physical_issued');
 expect({occupancy:{eligible:false,reason:'attendance_guard_occupied'}},
  'Attendance alapján nem foglalható','attendance_occupied_or_blocked');
});
test('ambiguous Attendance triggers review, not free',()=>{
 expect({occupancy:{eligible:false,reason:'attendance_review'}},
  'Jelenlét ellenőrzendő','attendance_review');
});
test('a booked car does not appear free even when status is unknown',()=>{
 expect({booking:{id:'qa'},bookingEligible:true},
  'Foglalt','existing_booking');
 expect({booking:{id:'qa'},bookingEligible:false},
  'Foglalt · ellenőrizendő','booking_requires_review');
 expect({booking:{id:'qa'},bookingEligible:undefined},
  'Foglalt · ellenőrizendő','booking_requires_review');
});
test('future day planning is not a verified physical vehicle',()=>{
 expect({date:'2026-11-03',occupancy:{eligible:true,reason:'other_day'}},
  'Tervezhető (jövőbeni)','future_plan_unverified');
 expect({date:'2026-11-03',occupancy:{eligible:false,reason:'unconfirmed_sources'}},
  'Nem ellenőrzött','unconfirmed_sources');
});
test('historical list describes missing reservation, not historical availability',()=>{
 expect({date:'2026-11-01'},'Nincs rögzített foglalás','historical_day');
});
test('service/non-operational car is not available even with stale occupancy',()=>{
 for(const vehicleStatus of ['Szerviz','Leállított','Ismeretlen']){
  expect({vehicleStatus,occupancy:{eligible:true,reason:'clear'}},
   'Nem elérhető','vehicle_out_of_service');
 }
});
test('no occupancy or invalid selected date remains conservative',()=>{
 expect({date:''},'Nem ellenőrzött','invalid_date');
 expect({today:''},'Nem ellenőrzött','invalid_date');
});
