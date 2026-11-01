import assert from 'node:assert/strict';
import {assessDailyPhysicalUse,bookingSourcesTrusted} from './booking-physical-guard.mjs';
const today='2026-11-02',date=today,driverId='DA0001',vehicleId='TESTCAR01';
const test=(value,overrides={})=>assessDailyPhysicalUse({
 date,today,driverId,vehicleId,assignments:[],handovers:[],...overrides
});
const status=reason=>assert.equal(reason.reason,'no_known_conflict');
status(test());
assert.equal(test(null,{assignments:[{active:true,driverId:'DA0002',vehicleId:'TESTCAR01'}]}).reason,'manual_checkout_conflict');
assert.equal(test(null,{assignments:[{active:true,driverId:'DA0001',vehicleId:'TESTCAR02'}]}).reason,'manual_checkout_conflict');
status(test(null,{assignments:[{active:true,driverId:'DA0001',vehicleId:'TESTCAR01'}]}));
status(test(null,{assignments:[{active:false,driverId:'DA0002',vehicleId:'TESTCAR01'}]}));
// DA hyphen has identity meaning; only plates lose separators.
assert.equal(test(null,{driverId:'DA-0001',
 assignments:[{active:true,driverId:'DA0001',vehicleId:'TESTCAR01'}]}).reason,'manual_checkout_conflict');
status(test(null,{driverId:'DA-0001',
 assignments:[{active:true,driverId:'DA-0001',vehicleId:'TEST-CAR01'}]}));

assert.equal(test(null,{handovers:[{status:'issued',driverId:'DA0002',vehicleId:'TESTCAR01'}]}).reason,'attendance_checkout_conflict');
assert.equal(test(null,{handovers:[{status:'return_review',driverId:'DA0002',vehicleId:'TESTCAR01'}]}).reason,'attendance_checkout_conflict');
assert.equal(test(null,{handovers:[{status:'issued',driverId:'DA0001',vehicleId:'TESTCAR02'}]}).reason,'attendance_checkout_conflict');
status(test(null,{handovers:[{status:'returned',driverId:'DA0002',vehicleId:'TESTCAR01'}]}));
assert.equal(test(null,{date:'2026-11-03',assignments:[{active:true,driverId:'DA0002',vehicleId:'TESTCAR01'}]}).reason,'future_plan_not_physically_verified');
assert.equal(test(null,{date:'2026-11-01'}).reason,'historical_booking_disallowed');
assert.equal(test(null,{assignments:null}).reason,'unverified_physical_sources');
assert.equal(test(null,{handovers:null}).reason,'unverified_physical_sources');
assert.equal(test(null,{vehicleId:''}).reason,'invalid_input');
assert.equal(test(null,{assignments:[{active:true,driverId:'DA0002',vehicleId:'OTHER001'}],
 handovers:[{status:'issued',driverId:'DA0003',vehicleId:'OTHER002'}]}).eligible,true);
assert.equal(test(null,{assignments:[{active:true,driverId:'',vehicleId:'TESTCAR01'}]}).eligible,false);
const now=Date.UTC(2026,10,2,7);
const fields=['drivers','vehicles','bookings','fleetAssignments','attendance'];
const healthy=Object.fromEntries(fields.map(k=>[k,{loaded:true,error:false,fromCache:false,pending:false,serverAt:now-1000}]));
assert.equal(bookingSourcesTrusted(healthy,{now}),true);
for(const field of fields){
 const failed={...healthy,[field]:{...healthy[field],fromCache:true}};
 assert.equal(bookingSourcesTrusted(failed,{now}),false,'cache '+field);
 const pending={...healthy,[field]:{...healthy[field],pending:true}};
 assert.equal(bookingSourcesTrusted(pending,{now}),false,'pending '+field);
 const stale={...healthy,[field]:{...healthy[field],serverAt:now-16*60*1000}};
 assert.equal(bookingSourcesTrusted(stale,{now}),false,'stale '+field);
 const absent={...healthy};delete absent[field];
 assert.equal(bookingSourcesTrusted(absent,{now}),false,'missing '+field);
}
assert.equal(bookingSourcesTrusted(healthy,{now,online:false}),false);
assert.equal(bookingSourcesTrusted(healthy,{now:now-5000}),false);
console.log('PASS: daily physical booking preflight: 16 scenarios + 22 source trust checks; no writes');
