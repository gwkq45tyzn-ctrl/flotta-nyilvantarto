import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const app=read('../../depokapacitas/app.js');
const preflight=read('../../depokapacitas/booking-physical-guard.mjs');
const build=read('./build-preview.mjs');
const workflow=read('../../.github/workflows/imile-staging.yml');
const rules=read('../../depokapacitas/firestore.rules');
assert.match(app,/import \{assessDailyPhysicalUse,bookingSourcesTrusted\} from '\.\/booking-physical-guard\.mjs'/);
assert.match(app,/getDocsFromServer\(collection\(db,'attendance'\)\)/);
assert.match(app,/!bookingSourcesTrusted\(state\.sourceMeta,\{online:navigator\.onLine\}\)/);
assert.match(app,/physicalReady=bookingSourcesTrusted\(state\.sourceMeta/);
assert.match(app,/const available=physicalReady\?vs\.filter/);
assert.match(app,/get\('fleetAssignments'\)\.filter\(a=>a\.active===true\)/);
assert.match(app,/\.\.\.physical\.openVehicleIds/);
assert.match(app,/tx\.get\(doc\(db,'fleetAssignments',vehicleId\)\)/);
assert.match(app,/tx\.get\(doc\(db,'fleetDriverAssignments',driverId\)\)/);
assert.match(app,/assessDailyPhysicalUse\(\{/);
assert.match(app,/if\(!physical\.eligible\)throw Error/);
assert.match(build,/'depokapacitas\/booking-physical-guard\.mjs'/);
assert.match(workflow,/booking-physical-guard\.test\.mjs/);
assert.match(workflow,/depo-booking-physical\.integration\.test\.mjs/);
assert.doesNotMatch(preflight,/\b(?:setDoc|runTransaction|fetch|writeBatch|addDoc|deleteDoc)\s*\(/);
// The server now checks manual Fleet assignment claims for current/earlier
// Budapest calendar days and blocks a reverse same-day Fleet checkout.
const bookingRule=rules.split('match /bookings/{bookingId}')[1].split('match /driverClaims/{key}')[0];
assert.match(bookingRule,/bookingManualFleetCompatible\(request\.resource\.data\)/);
assert.match(rules,/function bookingNotFutureInBudapest\(date\)/);
assert.match(rules,/function bookingManualFleetCompatible\(d\)/);
assert.match(rules,/function fleetCheckoutRespectsBooking\(d\)/);
assert.match(rules,/fleetCheckoutRespectsBooking\(d\)/);
// Remaining limitation: no atomic Attendance claim, so this PR stays draft.
assert.doesNotMatch(bookingRule,/attendance/);
console.log('PASS: staging booking UI preflight and transaction guard; backend rule still pending');
