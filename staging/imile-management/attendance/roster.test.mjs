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
assert.equal(result.missingPlanned,0);assert.equal(result.potentialUtilization,1);
result=planCapacity({date:'2026-11-02',vehicles:[],locks:[],plans:[],accesses:[]});
assert.equal(result.missingConfirmed,0);
assert.equal(planCapacity({date:'x',vehicles,locks:[],plans,accesses}).ready,false);
console.log('PASS: own daily company-car roster, future headcount, unverified vehicles and no sheet imports');
