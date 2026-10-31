import assert from 'node:assert/strict';
import {deriveAttendanceHandovers,normalizeAttendanceVehicleEvent} from './attendance-handover.mjs';
const drivers=[{id:'DA0001',daCode:'DA0001',active:true},{id:'DA0002',daCode:'DA0002',active:true},{id:'DA0003',daCode:'DA0003',active:false}];
const vehicles=[{id:'TESTCAR01',plate:'TESTCAR01',status:'Elérhető'},{id:'TESTCAR02',plate:'TESTCAR02',status:'Elérhető'},{id:'TESTCAR03',plate:'TESTCAR03',status:'Szerviz'}];
const evt=(id,daCode,type,vehicleId,time)=>({id,daCode,type,vehicleId,eventTime:'2026-11-02T'+time,timeKnown:true,
  ...(type==='Log In'?{pickupOdometer:12345}:{returnOdometer:12350})});
const photos={photoFront:'a',photoLeft:'b',photoRight:'c',photoBack:'d'};
const reduce=(events,manualBookings=[])=>deriveAttendanceHandovers({events,drivers,vehicles,manualBookings});
{
 const result=reduce([evt('i1','DA0001','Log In','TESTCAR01','06:00:00'),
   {...evt('o1','DA0001','Log Out','', '14:15:00'),...photos}]);
 assert.equal(result.handovers.length,1);
 assert.equal(result.handovers[0].status,'returned');
 assert.equal(result.handovers[0].sourceCheckOutId,'o1');
 assert.deepEqual(result.openVehicleIds,[]);
 assert.deepEqual(result.openDriverIds,[]);
}
{
 const result=reduce([evt('i1','DA0001','Log In','TESTCAR01','06:00:00'),
   evt('i1','DA0001','Log In','TESTCAR01','06:00:00'),
   evt('i2','DA0002','Log In','TESTCAR01','06:01:00')]);
 assert.equal(result.handovers.length,1);
 assert.deepEqual(result.alerts.map(x=>x.kind),['duplicate_event','vehicle_already_assigned']);
}
{
 const result=reduce([evt('i1','DA0001','Log In','TESTCAR01','06:00:00'),
   evt('o1','DA0001','Log Out','TESTCAR02','14:00:00')]);
 assert.equal(result.handovers[0].status,'issued');
 assert.equal(result.alerts[0].kind,'checkout_vehicle_mismatch');
}
{
 const result=reduce([evt('i1','DA0001','Log In','TESTCAR01','06:00:00'),
   evt('o1','DA0001','Log Out','', '14:00:00'),
   evt('i2','DA0002','Log In','TESTCAR01','14:01:00')]);
 assert.equal(result.handovers[0].status,'return_review');
 assert.deepEqual(result.openVehicleIds,['TESTCAR01']);
 assert.equal(result.alerts.at(-1).kind,'vehicle_already_assigned');
}
{
 const result=reduce([evt('i1','DA0001','Log In','', '06:00:00'),
   evt('i2','DA0002','Log In','TESTCAR03','06:01:00'),
   evt('i3','DA0003','Log In','TESTCAR02','06:02:00')]);
 assert.equal(result.handovers.length,0);
 assert.deepEqual(result.alerts.map(x=>x.kind),['vehicle_not_selected','vehicle_unavailable','driver_unavailable']);
}
{
 const result=reduce([evt('i1','DA0001','Log In','TESTCAR01','06:00:00')],[{date:'2026-11-02',driverId:'DA0002',vehicleId:'TESTCAR01'}]);
 assert.equal(result.handovers.length,0);
 assert.equal(result.alerts[0].kind,'planning_conflict');
}
{
 const result=reduce([{...evt('i1','DA0001','Log In','TESTCAR01','06:00:00'),timeKnown:false},
   evt('o1','DA0001','Log Out','TESTCAR01','14:00:00')]);
 assert.equal(result.handovers.length,0);
 assert.deepEqual(result.alerts.map(x=>x.kind),['invalid_attendance','orphan_checkout']);
}
{
 const result=reduce([
   {...evt('o1','DA0001','Log Out','TESTCAR01','14:00:00'),...photos},
   evt('i1','DA0001','Log In','TESTCAR01','06:00:00'),
   evt('i2','DA0002','Log In','TESTCAR02','07:00:00')
 ]);
 assert.equal(result.handovers[0].status,'returned');
 assert.equal(result.handovers[1].status,'issued');
 assert.deepEqual(result.openVehicleIds,['TESTCAR02']);
}
assert.equal(normalizeAttendanceVehicleEvent(evt('i1','DA0001','Log In','T-E-S-T C A R 0 1','06:00:00')).valid,true);
{
 const missing={...evt('m1','DA0001','Log In','TESTCAR01','06:00:00')};
 delete missing.pickupOdometer;
 const result=reduce([missing]);
 assert.equal(result.handovers.length,0);
 assert.equal(result.alerts[0].kind,'pickup_odometer_missing');
}
{
 const checkout={...evt('o1','DA0001','Log Out','TESTCAR01','14:00:00'),...photos};
 delete checkout.returnOdometer;
 const result=reduce([evt('i1','DA0001','Log In','TESTCAR01','06:00:00'),checkout]);
 assert.equal(result.handovers[0].status,'return_review');
 assert.deepEqual(result.openVehicleIds,['TESTCAR01']);
 assert.equal(result.alerts[0].kind,'return_odometer_missing');
}
{
 const result=reduce([
   evt('i1','DA0001','Log In','TESTCAR01','06:00:00'),
   {...evt('o1','DA0001','Log Out','TESTCAR01','14:00:00'),...photos,returnOdometer:12344}
 ]);
 assert.equal(result.handovers[0].status,'return_review');
 assert.equal(result.alerts[0].kind,'return_odometer_regression');
}
{
 const result=reduce([
   {...evt('i1','DA0001','Log In','TESTCAR01','06:00:00'),pickupOdometer:12340},
   {...evt('o1','DA0001','Log Out','TESTCAR01','14:00:00'),...photos,returnOdometer:12355}
 ]);
 assert.equal(result.handovers[0].status,'returned');
 assert.equal(result.handovers[0].drivenKm,15);
 assert.deepEqual(result.openVehicleIds,[]);
}
for(const bad of [-1,12.5,'12345',100000001]){
 const result=normalizeAttendanceVehicleEvent({...evt('i1','DA0001','Log In','TESTCAR01','06:00:00'),pickupOdometer:bad});
 assert.equal(result.reason,'invalid_odometer');
}
for(const day of ['2026-02-29','2099-02-31','2026-04-31','2200-01-01'])
 assert.equal(normalizeAttendanceVehicleEvent({...evt('bad','DA0001','Log In','TESTCAR01','06:00:00'),eventTime:day+'T06:00:00'}).valid,false);
assert.equal(normalizeAttendanceVehicleEvent({...evt('leap','DA0001','Log In','TESTCAR01','06:00:00'),eventTime:'2028-02-29T06:00:00'}).valid,true);
{
 const result=reduce([evt('i1','DA0001','Log In','TESTCAR01','06:00:00')],[{date:'2026-11-02',driverId:'DA0001',vehicleId:'TESTCAR02'}]);
 assert.equal(result.handovers.length,0);assert.equal(result.alerts[0].kind,'planning_conflict');
}
console.log('PASS: attendance pickup/return derivation, no car, double issue, planning conflict, missing photos and out-of-order events');
