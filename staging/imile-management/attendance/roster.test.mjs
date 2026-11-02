import assert from 'node:assert/strict';
import {planCourierDay,planCapacity} from './roster.mjs';
assert.deepEqual(planCourierDay({date:'2026-11-02',driverId:'DA1001',status:'confirmed'}),
 {ok:true,id:'2026-11-02__DA1001',date:'2026-11-02',driverId:'DA1001',status:'confirmed'});
for(const date of ['2026-11-31','2026-02-29','tomorrow',''])assert.equal(planCourierDay({date,driverId:'DA1001',status:'confirmed'}).ok,false);
assert.equal(planCourierDay({date:'2026-11-02',driverId:'DA1001',status:'arrived'}).ok,false);
const vehicles=[{plate:'ABC123',status:'Elérhető'},{plate:'XYZ789',status:'Elérhető'},{plate:'SERVICE',status:'Szerviz'}];
const accesses=[{driverId:'DA1001',active:true},{driverId:'DA1002',active:true},{driverId:'DA9999',active:false}];
const plans=[{date:'2026-11-02',driverId:'DA1001',status:'confirmed'},{date:'2026-11-02',driverId:'DA1002',status:'planned'},
 {date:'2026-11-02',driverId:'DA9999',status:'confirmed'},{date:'2026-11-03',driverId:'DA1001',status:'cancelled'}];
let result=planCapacity({date:'2026-11-02',vehicles,locks:[{plate:'ABC123',state:'awaiting_review'}],plans,accesses});
assert.equal(result.operationalCars,2);assert.equal(result.physicallyReady,1);assert.equal(result.unverifiedCars,1);
assert.equal(result.plannedCouriers,2);assert.equal(result.confirmedCouriers,1);assert.equal(result.missingConfirmed,1);
assert.equal(result.inUseCars,0);assert.equal(result.awaitingReviewCars,1);
const used=planCapacity({date:'2026-11-02',vehicles,locks:[{plate:'ABC123',state:'active'}],plans,accesses});
assert.equal(used.inUseCars,1);assert.equal(used.awaitingReviewCars,0);assert.equal(used.physicallyReady,1);
assert.equal(result.missingPlanned,0);assert.equal(result.potentialUtilization,1);
result=planCapacity({date:'2026-11-02',vehicles:[],locks:[],plans:[],accesses:[]});
assert.equal(result.missingConfirmed,0);
assert.equal(planCapacity({date:'x',vehicles,locks:[],plans,accesses}).ready,false);

const mixedFormat=planCapacity({date:'2026-11-02',
 vehicles:[{plate:'ABC-123',status:'Elérhető'},{plate:'XYZ-789',status:'Elérhető'}],
 locks:[{plate:'ABC123',state:'awaiting_review'}],plans:[],accesses:[]});
assert.equal(mixedFormat.ready,true);
assert.equal(mixedFormat.operationalCars,2);
assert.equal(mixedFormat.physicallyReady,1,
 'A hyphenated vehicle plate must match the normalized immutable lock plate');
const duplicateCar=planCapacity({date:'2026-11-02',vehicles:[
 {plate:'ABC-123',status:'Elérhető'},{plate:'ABC123',status:'Elérhető'}],locks:[],plans:[],accesses:[]});
assert.equal(duplicateCar.ready,false,'Alias vehicle plates must never inflate capacity');
assert.match(duplicateCar.reason,/ismétlődő rendszám/);
const unknownLock=planCapacity({date:'2026-11-02',vehicles:[
 {plate:'ABC-123',status:'Elérhető'}],locks:[{plate:'NONEXISTENT'}],plans:[],accesses:[]});
assert.equal(unknownLock.ready,false,'Unknown locked car requires operator investigation');
const duplicateLocks=planCapacity({date:'2026-11-02',vehicles:[
 {plate:'ABC-123',status:'Elérhető'}],locks:[{plate:'ABC-123'},{plate:'ABC123'}],plans:[],accesses:[]});
assert.equal(duplicateLocks.ready,false,'Duplicate lock aliases cannot imply a free car');

console.log('PASS: own daily company-car roster, future headcount, unverified vehicles and no sheet imports');
