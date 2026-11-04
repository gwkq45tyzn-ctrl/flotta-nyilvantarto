import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const app=readFileSync(new URL('./app.js',import.meta.url),'utf8');
const rules=readFileSync(new URL('./firestore-v1-restricted.rules',import.meta.url),'utf8');

test('actual Depot booking transaction must read canonical Fleet, migration approval and mirror masters',()=>{
 assert.match(app,/import \{assessCanonicalBookingMaster\} from '\.\/canonical-booking-gate\.mjs'/);
 assert.match(app,/tx\.get\(doc\(db,'flottaSharedState','current'\)\)/);
 assert.match(app,/tx\.get\(doc\(db,'flottaMigrationApproval','current'\)\)/);
 assert.match(app,/tx\.get\(doc\(db,'drivers',driverId\)\)/);
 assert.match(app,/tx\.get\(doc\(db,'vehicles',vehicleId\)\)/);
 assert.match(app,/if\(!canonicalCheck\.ready\)throw Error\('Flotta–Depó adateltérés/);
 assert.ok(app.indexOf('const canonicalCheck=assessCanonicalBookingMaster') <
  app.indexOf('tx.set(bRef,{date,vehicleId,driverId'),
  'Validate inside transaction BEFORE writing booking');
 assert.match(app,/await runTransaction\(db,async tx=>/);
});
test('Rules must still prohibit direct booking update and require atomic driverClaim',()=>{
 assert.match(rules,/match \/bookings\/\{bookingId\}/);
 assert.match(rules,/allow update: if false/);
 assert.match(rules,/existsAfter\(\/databases\/\$\(database\)\/documents\/driverClaims\//);
 assert.match(rules,/match \/driverClaims\/\{key\}/);
});
test('booking must not bypass source parity by looking only at stale UI state',()=>{
 const booking=app.slice(app.indexOf("else if(type==='booking')"),app.indexOf("else throw Error('Ismeretlen művelet.')"));
 assert.match(booking,/canonicalCheck/);
 assert.match(booking,/tx\.get\(doc\(db,'flottaSharedState','current'\)\)/);
 assert.doesNotMatch(booking,/setDoc\(bRef/);
 assert.doesNotMatch(booking,/writeBatch\(/);
});
