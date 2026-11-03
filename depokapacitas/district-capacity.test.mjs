import assert from 'node:assert/strict';
import {summarizeDistrictCapacity,verifyParcelDemand} from './district-capacity.mjs';
const drivers=[{id:'D001',active:true},{id:'D002',active:true},{id:'D003',active:false}];
const vehicles=[{id:'CAR1',status:'Elérhető'},{id:'CAR2',status:'Elérhető'},{id:'CAR3',status:'Szerviz'}];
const date='2026-11-02';
const demands=[
 {id:'A',date,district:'IX.',newCount:70,retryCount:20},
 {id:'B',date,district:'X.',newCount:40,retryCount:10}
];
const bookings=[
 {id:'1',date,district:'IX.',driverId:'D001',vehicleId:'CAR1',capacity:100},
 {id:'2',date,district:'X.',driverId:'D002',vehicleId:'CAR2',capacity:60}
];
const calc=(patch={})=>summarizeDistrictCapacity({date,today:'2026-11-01',demands,bookings,drivers,vehicles,...patch});
let result=calc();
assert.equal(result.totalDemand,140);
assert.equal(result.totalNew,110);
assert.equal(result.totalRetry,30);
assert.equal(result.totalCapacity,160);
assert.equal(result.gap,20);
assert.deepEqual(result.rows.map(x=>x.gap),[10,10]);
assert.equal(result.parcelsVerified,false);
result=calc({bookings:[...bookings,{...bookings[0],id:'3',district:'X.'}]});
assert.equal(result.totalCapacity,60,'Only unaffected courier/car capacity remains');
assert.equal(result.excludedBookings,2);
assert.ok(result.issues.some(x=>x.reason==='duplicate_assignment'));
result=calc({demands:[...demands,{...demands[0],id:'Z'}]});
assert.equal(result.totalDemand,null,'Duplicate aggregate rows must never be silently summed');
assert.equal(result.rows[0].demand,null);
result=calc({demands:[demands[0]]});
assert.equal(result.totalDemand,null,'Missing district demand cannot mean zero');
result=calc({bookings:[...bookings,{id:'4',date,district:'XI.',driverId:'D003',vehicleId:'CAR3',capacity:80}]});
assert.equal(result.totalCapacity,160);
assert.equal(result.totalDemand,null,'Unknown district needs demand source');
const manifest=[
 {date,trackingId:' 123 ',district:'IX.',kind:'new'},
 {date,trackingId:'123',district:'IX.',kind:'new'},
 {date,trackingId:'124',district:'IX.',kind:'retry'},
 {date,trackingId:'125',district:'X.',kind:'new'}
];
let parcels=verifyParcelDemand(manifest,{date});
assert.equal(parcels.verified,true);
assert.equal(parcels.uniqueCount,3);
assert.deepEqual(parcels.districts.map(x=>[x.newCount,x.retryCount]),[[1,1],[1,0]]);
parcels=verifyParcelDemand([...manifest,{date,trackingId:'124',district:'IX.',kind:'new'}],{date});
assert.equal(parcels.verified,false);
assert.equal(parcels.uniqueCount,3);
assert.ok(parcels.issues.some(x=>x.reason==='conflicting_parcel'));
parcels=verifyParcelDemand([{date,trackingId:'',district:'IX.',kind:'new'}],{date});
assert.equal(parcels.verified,false);
assert.equal(verifyParcelDemand([],{date}).verified,false);
console.log('PASS: district New/Retry capacity, unknown demand, double assignment exclusion and parcel identity checks');
