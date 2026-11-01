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
const login=(id,daCode,when=today+'T08:30:00')=>({
 id,daCode,vehicleId:'ABC123',eventTime:when,eventDate:when.slice(0,10),
 timeKnown:true,type:'Log In'
});
const attendanceBookings=[{id:today+'__ABC123',date:today,
 vehicleId:'ABC123',driverId:'DA0002'}];
const mismatches=collectFleetAlerts({...base,bookings:attendanceBookings,
 attendance:[login('QA_LOGIN_1','DA0001'),login('QA_LOGIN_1','DA0001')]
});
assert.equal(mismatches.filter(x=>x.id==='fleet-conflict-attendance:QA_LOGIN_1').length,1);
assert.ok(mismatches.some(x=>x.title.includes('Attendance és napi foglalás eltér')&&x.level==='urgent'));
const matches=collectFleetAlerts({...base,bookings:attendanceBookings,
 attendance:[login('QA_LOGIN_2','DA0002')]
});
assert.equal(matches.filter(x=>x.id.startsWith('fleet-conflict-attendance:')).length,0);
const lastDay=collectFleetAlerts({...base,bookings:attendanceBookings,
 attendance:[login('QA_LOGIN_3','DA0001','2026-11-01T08:30:00')]
});
assert.equal(lastDay.filter(x=>x.id.startsWith('fleet-conflict-attendance:')).length,0);
const invalid=collectFleetAlerts({...base,bookings:attendanceBookings,
 attendance:[{...login('QA_LOGIN_4','DA0001'),timeKnown:false}]
});
assert.equal(invalid.filter(x=>x.id.startsWith('fleet-conflict-attendance:')).length,0);
const distinguishDA=collectFleetAlerts({...base,bookings:[{...attendanceBookings[0],driverId:'DA-0001'}],
 attendance:[login('QA_LOGIN_5','DA0001')]
});
assert.equal(distinguishDA.filter(x=>x.id.startsWith('fleet-conflict-attendance:')).length,1);
assert.deepEqual(collectFleetAlerts({today}),[]);
assert.throws(()=>collectFleetAlerts({today:'2026-11-32'}),/Érvénytelen/);
// The aggregator must remain read-only and must not mutate its input.
assert.equal(vehicles[0].status,'Elérhető');
assert.equal(fleetRecords[0].data.nextServiceDate,'2026-11-02');
console.log('PASS: shared Fleet expiry/service/license/card/unavailability and same-day booking conflicts');
