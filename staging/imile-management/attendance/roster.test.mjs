import assert from 'node:assert/strict';
import {planCourierDay,planCapacity} from './roster.mjs';
assert.deepEqual(planCourierDay({date:'2026-11-02',driverId:'DA1001',status:'confirmed'}),
 {ok:true,id:'2026-11-02__DA1001',date:'2026-11-02',driverId:'DA1001',status:'confirmed'});
for(const date of ['2026-11-31','2026-02-29','tomorrow',''])assert.equal(planCourierDay({date,driverId:'DA1001',status:'confirmed'}).ok,false);
assert.equal(planCourierDay({date:'2026-11-02',driverId:'DA1001',status:'arrived'}).ok,false);
const vehicles=[{plate:'ABC123',status:'Elérhető'},{plate:'XYZ789',status:'Elérhető'},{plate:'SERVICE',status:'Szerviz'}];
const accesses=[{driverId:'DA1001',active:true},{driverId:'DA1002',active:true},{driverId:'DA9999',active:false}];
const drivers=[{id:'DA1001',active:true},{id:'DA1002',active:true},{id:'DA9999',active:false}];
const plans=[{date:'2026-11-02',driverId:'DA1001',status:'confirmed'},{date:'2026-11-02',driverId:'DA1002',status:'planned'},
 {date:'2026-11-02',driverId:'DA9999',status:'confirmed'},{date:'2026-11-03',driverId:'DA1001',status:'cancelled'}];
const lock={plate:'ABC123',state:'awaiting_review',driverId:'DA1001',uid:'user_01',sessionId:'s_fake'};
const driverLock={...lock};
let result=planCapacity({date:'2026-11-02',vehicles,locks:[lock],driverLocks:[driverLock],plans,accesses,drivers});
assert.equal(result.operationalCars,2);assert.equal(result.physicallyReady,1);assert.equal(result.unverifiedCars,1);
assert.equal(result.plannedCouriers,2);assert.equal(result.confirmedCouriers,1);assert.equal(result.missingConfirmed,1);
const inUse=planCapacity({date:'2026-11-02',vehicles,
 locks:[{...lock,state:'active'}],driverLocks:[{...driverLock,state:'active'}],plans,accesses,drivers});
assert.equal(inUse.ready,true);
assert.equal(inUse.inUseCars,1);assert.equal(inUse.awaitingReviewCars,0);
assert.equal(result.missingPlanned,0);assert.equal(result.potentialUtilization,1);
assert.equal(result.inUseCars,0);assert.equal(result.awaitingReviewCars,1);
result=planCapacity({date:'2026-11-02',vehicles:[],locks:[],driverLocks:[],plans:[],accesses:[],drivers});
assert.equal(result.missingConfirmed,0);
assert.equal(planCapacity({date:'x',vehicles,locks:[],driverLocks:[],plans,accesses,drivers}).ready,false);

const mixedFormat=planCapacity({date:'2026-11-02',
 vehicles:[{plate:'ABC-123',status:'Elérhető'},{plate:'XYZ-789',status:'Elérhető'}],
 locks:[lock],driverLocks:[driverLock],plans:[],accesses:[],drivers});
assert.equal(mixedFormat.ready,true);
assert.equal(mixedFormat.operationalCars,2);
assert.equal(mixedFormat.physicallyReady,1,
 'A hyphenated vehicle plate must match the normalized immutable lock plate');
const duplicateCar=planCapacity({date:'2026-11-02',vehicles:[
 {plate:'ABC-123',status:'Elérhető'},{plate:'ABC123',status:'Elérhető'}],locks:[],driverLocks:[],plans:[],accesses:[],drivers});
assert.equal(duplicateCar.ready,false,'Alias vehicle plates must never inflate capacity');
assert.match(duplicateCar.reason,/ismétlődő rendszám/);
const unknownLock=planCapacity({date:'2026-11-02',vehicles:[
 {plate:'ABC-123',status:'Elérhető'}],locks:[{plate:'NONEXISTENT'}],driverLocks:[],plans:[],accesses:[],drivers});
assert.equal(unknownLock.ready,false,'Unknown locked car requires operator investigation');
const duplicateLocks=planCapacity({date:'2026-11-02',vehicles:[
 {plate:'ABC-123',status:'Elérhető'}],locks:[{plate:'ABC-123'},{plate:'ABC123'}],driverLocks:[],plans:[],accesses:[],drivers});
assert.equal(duplicateLocks.ready,false,'Duplicate lock aliases cannot imply a free car');


const base={date:'2026-11-02',vehicles:[{plate:'ABC-123',status:'Elérhető'},
 {plate:'XYZ-789',status:'Elérhető'}],locks:[lock],driverLocks:[driverLock],plans:[],accesses:[],drivers};
assert.equal(planCapacity(base).ready,true,'Consistent locks must preserve availability calculations');
assert.equal(planCapacity({...base,driverLocks:undefined}).ready,false,'Missing DA lock source must fail closed');
assert.equal(planCapacity({...base,driverLocks:[]}).ready,false,'Missing DA lock must block fleet KPI');
assert.equal(planCapacity({...base,locks:[],driverLocks:[driverLock]}).ready,false,'Orphan DA lock must block fleet KPI');
assert.equal(planCapacity({...base,driverLocks:[driverLock,driverLock]}).ready,false,'Duplicate DA lock must fail closed');
assert.equal(planCapacity({...base,driverLocks:[{...driverLock,uid:'other_user'}]}).ready,false,'UID mismatch must fail closed');
assert.equal(planCapacity({...base,driverLocks:[{...driverLock,sessionId:'s_other'}]}).ready,false,'Session mismatch must fail closed');
assert.equal(planCapacity({...base,driverLocks:[{...driverLock,state:'active'}]}).ready,false,'Lock state mismatch must fail closed');
assert.equal(planCapacity({...base,driverLocks:[{...driverLock,plate:'NOTREAL'}]}).ready,false,'Orphan vehicle references must fail closed');
assert.equal(planCapacity({...base,locks:[{...lock,driverId:'DA9999'}]}).ready,false,'DA mismatch must fail closed');


const capacityBase={date:'2026-11-02',vehicles,locks:[],driverLocks:[],plans,accesses,drivers};
assert.equal(planCapacity(capacityBase).confirmedCouriers,1);
assert.equal(planCapacity({...capacityBase,drivers:undefined}).ready,false,
 'Master driver data is required even when courierAccess exists');
assert.equal(planCapacity({...capacityBase,drivers:drivers.map(d=>({...d,active:d.id==='DA1001'?false:d.active}))}).confirmedCouriers,0,
 'Deactivated master driver must not count as confirmed');
assert.equal(planCapacity({...capacityBase,accesses:[...accesses,{driverId:'DA1001',active:true}]}).ready,false,
 'Two active accounts for the same DA must not be treated as safe capacity');
assert.equal(planCapacity({...capacityBase,plans:[...plans,plans[0]]}).ready,false,
 'Duplicate day plans for one DA code must be reviewed');
assert.equal(planCapacity({...capacityBase,accesses:accesses.filter(a=>a.driverId!=='DA1001')}).confirmedCouriers,0,
 'Without an active company-car access a master driver must not count');

console.log('PASS: own daily company-car roster, DA lock consistency, no old sheet imports');
