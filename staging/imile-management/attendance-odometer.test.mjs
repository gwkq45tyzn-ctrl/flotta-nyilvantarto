import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {deriveAttendanceHandovers} from './attendance-handover.mjs';

const gs=readFileSync(new URL('../../depokapacitas/google-sync/Code.gs',import.meta.url),'utf8');
const start=gs.indexOf('function parseAttendanceOdometer(');
const end=gs.indexOf('function formatDisplayTimestamp(s){',start);
assert.ok(start>=0 && end>start,'Missing safe odometer parser');
const parseAttendanceOdometer=new Function(gs.slice(start,end)+'return parseAttendanceOdometer;')();

for(const [raw,display,expected] of [
 [12345,'12 345',12345],['12 345','12 345',12345],
 [0,'0',0],[100000000,'100000000',100000000],
 ['', '', null],[undefined,'',null],
 ['12.5','12.5',null],[-1,'-1',null],[12345.5,'12345.5',null],
 ['12,345','12,345',null],[100000001,'100000001',null],
 ['abc','abc',null]
]) assert.equal(parseAttendanceOdometer(raw,display),expected,String(raw));

assert.match(gs,/pickupIndex=header\.findIndex/);
assert.match(gs,/returnIndex=header\.findIndex/);
assert.match(gs,/sharedOdometerIndex=header\.findIndex/);
assert.match(gs,/type==='Log In'\?'pickupOdometer':'returnOdometer'/);
assert.match(gs,/integerValue:String\(value\)/);
assert.doesNotMatch(gs,/getRange\([^)]*\)\.setValue/);

const driver=[{id:'DA0001',active:true}];
const car=[{id:'TESTCAR01',status:'Elérhető'}];
const event=(id,type,extra={})=>({
 id,daCode:'DA0001',vehicleId:'TESTCAR01',type,
 eventTime:type==='Log In'?'2026-11-02T06:00:00':'2026-11-02T14:00:00',
 timeKnown:true,...extra
});
const photos={photoFront:'a',photoLeft:'b',photoRight:'c',photoBack:'d'};
const run=events=>deriveAttendanceHandovers({events,drivers:driver,vehicles:car});

let r=run([event('i','Log In')]);
assert.equal(r.handovers.length,0);
assert.equal(r.alerts[0].kind,'pickup_odometer_missing');

r=run([event('i','Log In',{pickupOdometer:100}),event('o','Log Out',{...photos})]);
assert.equal(r.handovers[0].status,'return_review');
assert.deepEqual(r.openVehicleIds,['TESTCAR01']);

r=run([event('i','Log In',{pickupOdometer:100}),event('o','Log Out',{...photos,returnOdometer:99})]);
assert.equal(r.handovers[0].status,'return_review');
assert.equal(r.alerts[0].kind,'return_odometer_regression');

r=run([event('i','Log In',{pickupOdometer:100}),event('o','Log Out',{...photos,returnOdometer:110})]);
assert.equal(r.handovers[0].status,'returned');
assert.equal(r.handovers[0].drivenKm,10);
assert.deepEqual(r.openVehicleIds,[]);

console.log('PASS: optional Attendance km parsing, safe no-auto-release and legitimate 10 km round-trip');
