// Source-level security contract assertions. This does NOT compile Firestore rules
// and must NOT be used instead of Firebase Emulator and Rules Playground tests.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const rules=readFileSync(new URL('./firestore.rules',import.meta.url),'utf8');

const section=(path,next)=> {
  const start=rules.indexOf('match /'+path);
  assert.ok(start>=0,'Missing Firestore rule: '+path);
  const end=rules.indexOf('match /'+next,start);
  assert.ok(end>start,'Missing next rule block after '+path);
  return rules.slice(start,end);
};
const users=section('users/{uid}','drivers/{driverId}');
const drivers=section('drivers/{driverId}','vehicles/{vehicleId}');
const vehicles=section('vehicles/{vehicleId}','driverCapacities/{driverId}');
const capacities=section('driverCapacities/{driverId}','demands/{id}');
const demands=section('demands/{id}','results/{id}');
const results=section('results/{id}','bookings/{bookingId}');
const bookings=section('bookings/{bookingId}','driverClaims/{key}');
const claims=section('driverClaims/{key}','attendance/{id}');
const attendance=section('attendance/{id}','sourceRows/{id}');
const sourceRows=section('sourceRows/{id}','{path=**}');

assert.match(rules,/match \/\{path=\*\*\} \{ allow read, write: if false;/);
assert.doesNotMatch(rules,/allow\s+(read|write|create|update|delete)\s*(?:,\s*\w+)?\s*:\s*if\s*true/);
assert.match(rules,/function member\(\)/);
assert.match(rules,/get\(userPath\(\)\)\.data\.active == true/);
assert.match(rules,/function exactFields\(data, fields\)/);
assert.match(rules,/data\.keys\(\)\.hasAll\(fields\)/);
assert.match(rules,/data\.keys\(\)\.hasOnly\(fields\)/);

for (const [name,body] of Object.entries({users,drivers,vehicles,capacities,demands,results,bookings,claims,attendance,sourceRows})){
  assert.match(body,/exactFields\(request\.resource\.data,/,'Missing strict required-fields validation: '+name);
  assert.match(body,/allow (create|create, update): if (admin|editor)\(\)/,'Missing write authorization: '+name);
}
assert.match(drivers,/validDriverCode\(driverId\)/);
assert.match(drivers,/request\.resource\.data\.daCode == driverId/);
assert.match(drivers,/request\.resource\.data\.active is bool/);
assert.match(vehicles,/validVehiclePlate\(vehicleId\)/);
assert.match(vehicles,/request\.resource\.data\.plate == vehicleId/);
assert.match(capacities,/nonNegative\(request\.resource\.data\.capacity,10000\)/);
assert.match(demands,/id == request\.resource\.data\.date \+ '__' \+ request\.resource\.data\.district/);
assert.match(results,/id == request\.resource\.data\.date \+ '__' \+ request\.resource\.data\.driverId \+ '__' \+ request\.resource\.data\.district/);
assert.match(results,/exists\(\/databases\/\$\(database\)\/documents\/drivers/);
assert.match(bookings,/request\.resource\.data\.capacity == declaredDriverCapacity\(request\.resource\.data\.driverId\)/);
assert.match(bookings,/data\.active == true/);
assert.match(bookings,/data\.status == 'Elérhető'/);
assert.match(bookings,/getAfter\(.+driverClaims/);
assert.match(bookings,/\.data\.date == request\.resource\.data\.date/);
assert.match(bookings,/\.data\.driverId == request\.resource\.data\.driverId/);
assert.match(claims,/existsAfter\(.+bookings/);
assert.match(claims,/getAfter\(.+bookings/);
assert.match(claims,/\.data\.date == request\.resource\.data\.date/);
assert.match(claims,/\.data\.driverId == request\.resource\.data\.driverId/);
assert.match(claims,/request\.resource\.data\.bookingId == request\.resource\.data\.date \+ '__' \+ getAfter/);
assert.match(claims,/allow update: if false;/);
assert.match(bookings,/allow update: if false;/);
for(const k of ['eventTime','eventDate','timeKnown','daCode','driverName','vendor','type','status','photoFront','photoLeft','photoRight','photoBack','source']){
  assert.ok(attendance.includes("'"+k+"'"),'Missing attendance field '+k);
}
assert.match(attendance,/request\.resource\.data\.eventTime\.matches/);
assert.match(attendance,/request\.resource\.data\.timeKnown is bool/);
assert.match(attendance,/validDriverCode\(request\.resource\.data\.daCode\)/);
assert.match(attendance,/request\.resource\.data\.type in \['Log In','Log Out'\]/);
for(const f of ['driverName','vendor','status','photoFront','photoLeft','photoRight','photoBack']){
  assert.ok(attendance.includes('request.resource.data.'+f),'Missing field type/length check '+f);
}
assert.match(sourceRows,/request\.resource\.data\.content\.size\(\) <= 18000/);
assert.match(sourceRows,/request\.resource\.data\.importedAt\.matches/);
console.log('PASS: required fields, claims dates, attendance types and role checks in staging source (NOT compiled rules)');
