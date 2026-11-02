import assert from 'node:assert/strict';
import {auditCourierAccess} from './access-audit.mjs';
assert.deepEqual(auditCourierAccess(null),{ready:false,duplicates:[],invalid:[]});
const result=auditCourierAccess([
 {uid:'first',driverId:'DA0001',active:true},
 {uid:'second',driverId:'DA0001',active:true},
 {uid:'third',driverId:'DA0002',active:true},
 {uid:'fourth',driverId:'DA0002',active:false},
 {uid:'first',driverId:'DA0001',active:true},
 {id:'fifth',driverId:'DA0003',active:true},
 {uid:'sixth',driverId:'bad code',active:true},
 {uid:'',driverId:'DA0004',active:true}
]);
assert.deepEqual(result.duplicates,[{driverId:'DA0001',activeAccounts:2}]);
assert.equal(result.invalid.length,2);
assert.deepEqual(auditCourierAccess([]),{ready:true,duplicates:[],invalid:[]});
console.log('PASS: duplicate canonical DA access is visibly flagged with no personal Auth data');
