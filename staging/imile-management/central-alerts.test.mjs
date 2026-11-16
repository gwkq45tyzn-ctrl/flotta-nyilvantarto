import assert from 'node:assert/strict';
import {collectFleetAlerts} from './central-alerts.mjs';

const today='2026-11-02';
const vehicles=[
  {id:'ABC123',plate:'ABC123',status:'Elérhető'},
  {id:'XYZ123',plate:'XYZ123',status:'Szerviz'},
  {id:'DEF456',plate:'DEF456',status:'Leállított'},
  {id:'NEW111',plate:'NEW111',status:'Elérhető'}
];
const drivers=[{id:'DA0001',name:'Teszt Futár',daCode:'DA0001'}];
const fleetRecords=[
 {id:'vehicle__ABC123',kind:'vehicle',data:{vehicleId:'ABC123',insuranceExpiry:'2026-11-05',nextServiceDate:'2026-11-02',inspectionExpiry:'2026-12-20',cascoExpiry:'2027-05-01'}},
 {id:'service__SYNTHETIC01',kind:'service',data:{vehicleId:'ABC123',date:'2026-11-02',provider:'Demó szerviz',status:'Szerviz'}},
 {id:'driver__DA0001',kind:'driver',data:{driverId:'DA0001',licenseExpiry:'2026-11-01'}},
 {id:'fuel__CARD1',kind:'fuel',data:{code:'CARD1',vehicleId:'ABC123',expiry:'2026-11-20'}},
 {id:'vehicle__NEW111',kind:'vehicle',data:{vehicleId:'NEW111',rentalExpiry:'2026-12-15'}}
];
const base={today,vehicles,drivers,fleetRecords};
const all=collectFleetAlerts({...base,
 fleetAssignments:[{vehicleId:'ABC123',driverId:'DA0001',active:true}],
 bookings:[{id:'2026-11-02__ABC123',date:today,vehicleId:'ABC123',driverId:'DA0002'},
  {id:'2026-11-03__NEW111',date:'2026-11-03',vehicleId:'NEW111',driverId:'DA0001'}]});
assert.ok(all.some(x=>x.title.includes('ABC123 – tervezett szerviz')&&x.level==='urgent'));
assert.ok(all.some(x=>x.type==='conflict'&&x.title.includes('szerviznapra')));
assert.ok(all.some(x=>x.type==='conflict'&&x.title.includes('eltérő futárhoz')));
assert.ok(all.some(x=>x.title.includes('XYZ123 – szervizben')));
assert.ok(all.some(x=>x.title.includes('DEF456 – leállított')));
assert.ok(all.some(x=>x.title.includes('Kötelező biztosítás')&&x.title.includes('ABC123')));
assert.ok(all.some(x=>x.title.includes('Műszaki')&&x.level==='upcoming'));
assert.ok(all.some(x=>x.title.includes('Tankolókártya CARD1')));
assert.ok(all.some(x=>x.title.includes('Teszt Futár')&&x.detail.includes('Lejárt')));
assert.ok(all.some(x=>x.title.includes('Bérleti szerződés')));
assert.ok(!all.some(x=>x.title.includes('Casco')),'Dates beyond 60 days must not be shown');
assert.equal(all.filter(x=>x.title.includes('ABC123 – tervezett szerviz')).length,1,'Duplicate service date must be suppressed');
assert.ok(all.every(x=>x.source==='Flotta'&&x.actionUrl.includes('operations.html')));
assert.deepEqual(all.map(x=>x.level),[...all].sort((a,b)=>({urgent:0,warning:1,upcoming:2,info:3}[a.level]-{urgent:0,warning:1,upcoming:2,info:3}[b.level])).map(x=>x.level));
assert.deepEqual(collectFleetAlerts({today}),[]);
assert.throws(()=>collectFleetAlerts({today:'2026-11-32'}),/Érvénytelen/);
// The aggregator must remain read-only and must not mutate its input.
assert.equal(vehicles[0].status,'Elérhető');
assert.equal(fleetRecords[0].data.nextServiceDate,'2026-11-02');
// Owner-reported P1: an overdue mandatory oil/service kilometer threshold
// must be surfaced even when no service date is configured.
const kmVehicle={id:'KM001',plate:'KM-001',status:'Elérhető'};
const kmRecord=(mileage,nextServiceMileage)=>({
  id:'vehicle__KM001',kind:'vehicle',
  data:{vehicleId:'KM001',mileage,nextServiceMileage}
});
const kmAlerts=(mileage,nextServiceMileage)=>
  collectFleetAlerts({today,vehicles:[kmVehicle],
    fleetRecords:[kmRecord(mileage,nextServiceMileage)]});
const overdue=kmAlerts(37891,37500);
assert.equal(overdue.length,1);
assert.equal(overdue[0].id,'fleet-service-mileage:vehicle__KM001');
assert.equal(overdue[0].level,'urgent');
assert.equal(overdue[0].remainingKm,-391);
assert.match(overdue[0].title,/kötelező olajcsere \/ szerviz \(km\)/);
assert.match(overdue[0].detail,/391 km-rel túllépte/);
assert.match(overdue[0].detail,/37891 km; határ: 37500 km/);
assert.equal(overdue[0].vehicleId,'KM001');
assert.equal(overdue[0].dueDate,null,'Odometer-only threshold is not a calendar deadline');
assert.equal(overdue[0].days,null);
assert.equal(overdue[0].type,'service');
assert.equal(overdue[0].source,'Flotta');
assert.equal(overdue[0].actionUrl,'../staging/imile-management/fleet/operations.html');
const atLimit=kmAlerts(38000,38000);
assert.equal(atLimit.length,1);
assert.equal(atLimit[0].level,'urgent');
assert.match(atLimit[0].detail,/Elérte a kötelező/);
const warning=kmAlerts(37500,38000);
assert.equal(warning.length,1);
assert.equal(warning[0].level,'warning');
assert.equal(warning[0].remainingKm,500);
const upcoming=kmAlerts(39000,40000);
assert.equal(upcoming.length,1);
assert.equal(upcoming[0].level,'upcoming');
assert.equal(upcoming[0].remainingKm,1000);
assert.equal(upcoming[0].dueDate,null);
// Mixed calendar and odometer alerts must sort safely and keep the actual
// calendar expiry ahead of the date-unknown alert at the same priority.
const mixed=collectFleetAlerts({today,vehicles:[kmVehicle],
  fleetRecords:[kmRecord(37891,37500),{
    id:'driver__DA002',kind:'driver',
    data:{driverId:'DA002',licenseExpiry:today}
  }]});
assert.equal(mixed.length,2);
assert.deepEqual(mixed.map(x=>x.level),['urgent','urgent']);
assert.equal(mixed[0].dueDate,today);
assert.equal(mixed[1].dueDate,null);
// The default 0 means no configured due mileage; a bad field must not
// generate spurious alerts or display the full source.
assert.deepEqual(kmAlerts(39000,40001),[]);
for(const bad of [[100000,0],[-1,38000],['39000',40000],
    [39000,'40000'],[NaN,40000],[Infinity,40000],
    [39000,-1],[39000,1.5]]){
  assert.deepEqual(kmAlerts(...bad),[]);
}
const originalKmRecord=kmRecord(37891,37500);
const originalKmSnapshot=JSON.stringify(originalKmRecord);
collectFleetAlerts({today,vehicles:[kmVehicle],fleetRecords:[originalKmRecord]});
assert.equal(JSON.stringify(originalKmRecord),originalKmSnapshot);
console.log('PASS: overdue/equal/near service-odometer alerts, unconfigured and malformed km denial, no mutation');
console.log('PASS: shared Fleet expiry/service/license/card/unavailability and same-day booking conflicts');
