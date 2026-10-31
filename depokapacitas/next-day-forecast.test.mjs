import assert from 'node:assert/strict';
import {followingDay,prepareNextDay} from './next-day-forecast.mjs';

assert.equal(followingDay('2026-10-31'),'2026-11-01');
assert.equal(followingDay('2026-12-31'),'2027-01-01');
assert.equal(followingDay('2028-02-28'),'2028-02-29');
assert.equal(followingDay('2028-02-29'),'2028-03-01');
for(const bad of ['2026-02-29','2026-11-31','','tomorrow'])
  assert.throws(()=>followingDay(bad));

const date='2026-11-01',baseDate='2026-10-31';
const drivers=[{id:'D001',active:true},{id:'D002',active:true},{id:'D003',active:true}];
const vehicles=[{id:'CAR1',status:'Elérhető'},{id:'CAR2',status:'Elérhető'},{id:'CAR3',status:'Elérhető'}];
const demands=[
 {date,district:'IX.',newCount:60,retryCount:10},
 {date,district:'X.',newCount:40,retryCount:10}
];
const bookings=[
 {id:'B1',date,district:'IX.',driverId:'D001',vehicleId:'CAR1',capacity:70,status:'confirmed'},
 {id:'B2',date,district:'X.',driverId:'D002',vehicleId:'CAR2',capacity:55,status:'planned'}
];
const calc=patch=>prepareNextDay({
 baseDate,today:baseDate,demands,bookings,drivers,vehicles,sourcesReady:true,...patch
});

let x=calc();
assert.equal(x.date,date);
assert.equal(x.status,'needs_confirmation');
assert.equal(x.totalNew,100);
assert.equal(x.totalRetry,20);
assert.equal(x.totalDemand,120);
assert.equal(x.plannedCapacity,125);
assert.equal(x.confirmedCapacity,70);
assert.equal(x.confirmedCouriers,1);
assert.equal(x.pendingCount,1);
assert.equal(x.plannedGap,5);
assert.equal(x.confirmedGap,-50);
assert.deepEqual(x.rows.map(r=>r.missingConfirmed),[0,50]);
assert.equal(x.demandVerifiedByParcel,false);

x=calc({bookings:bookings.map(b=>({...b,status:'confirmed'}))});
assert.equal(x.status,'ready');
assert.equal(x.confirmedCapacity,125);
assert.equal(x.confirmedCouriers,2);

x=calc({sourcesReady:false});
assert.equal(x.status,'unavailable');
assert.equal(x.totalDemand,null);
assert.equal(x.plannedCapacity,null);
assert.equal(x.confirmedCapacity,null);
assert.equal(x.confirmedGap,null);
assert.equal(x.pendingCount,null);

x=calc({demands:[demands[0]]});
assert.equal(x.status,'incomplete');
assert.equal(x.totalDemand,null);
assert.equal(x.confirmedGap,null);
assert.deepEqual(x.missingDemandDistricts,['X.']);

x=calc({bookings:[
 {...bookings[0],capacity:100,status:'confirmed'},
 {...bookings[1],capacity:10,status:'confirmed'}
]});
assert.equal(x.status,'shortage','A whole-depot surplus cannot hide a district shortage');
assert.equal(x.plannedGap,-10);
assert.deepEqual(x.rows.map(r=>r.missingPlanned),[0,40]);

x=calc({bookings:[
 {...bookings[0],status:'confirmed'},
 {...bookings[0],id:'B3',district:'X.',vehicleId:'CAR3',status:'confirmed'},
 {...bookings[1],status:'confirmed'}
]});
assert.equal(x.confirmedCapacity,55,'Duplicated driver is excluded, not counted twice');
assert.equal(x.invalidBookingCount,2);
assert.equal(x.status,'shortage');
assert.ok(x.issues.some(i=>i.reason==='duplicate_assignment'));

x=calc({bookings:[{...bookings[0],status:'confirmed',capacity:-1},bookings[1]]});
assert.equal(x.confirmedCapacity,0,'Invalid confirmed capacity cannot inflate coverage');
assert.ok(x.invalidBookingCount>=1);

x=calc({demands:[demands[0],{...demands[0],id:'duplicate'},demands[1]]});
assert.equal(x.status,'incomplete');
assert.equal(x.totalDemand,null);

console.log('PASS: next-day date rollover, planned/confirmed split, district shortages, dedupe and unknown-input guards');
