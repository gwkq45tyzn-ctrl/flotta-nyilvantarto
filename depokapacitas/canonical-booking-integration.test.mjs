import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('./app.js',import.meta.url),'utf8');
const txn=readFileSync(new URL('./canonical-booking-transaction.mjs',import.meta.url),'utf8');
const rules=readFileSync(new URL('./firestore-v1-restricted.rules',import.meta.url),'utf8');

test('Depot booking calls actual shared transaction adapter and awaits server acknowledgement',()=>{
 assert.match(app,/import \{commitCanonicalDepotBooking\} from '\.\/canonical-booking-transaction\.mjs'/);
 assert.match(app,/await commitCanonicalDepotBooking\(\{/);
 assert.match(app,/sdk:\{doc,runTransaction\}/);
 assert.match(app,/getCurrentUid:\(\)=>auth\.currentUser\?\.uid/);
 assert.match(app,/offline:!navigator\.onLine/);
 assert.ok(app.indexOf('await commitCanonicalDepotBooking(')<
   app.indexOf("toast('Foglalás szerveroldalon visszaigazolva."),
   'No success toast before server-acknowledged commit');
});
test('transaction adapter re-reads approval, full Fleet and live mirror docs before BOTH writes',()=>{
 assert.match(txn,/await sdk\.runTransaction\(db,async tx=>/);
 assert.match(txn,/tx\.get\(refs\.fleet\)/);
 assert.match(txn,/tx\.get\(refs\.approval\)/);
 assert.match(txn,/tx\.get\(refs\.driver\)/);
 assert.match(txn,/tx\.get\(refs\.vehicle\)/);
 assert.match(txn,/assessCanonicalBookingMaster\(/);
 assert.ok(txn.indexOf('assessCanonicalBookingMaster(') <
   txn.indexOf('tx.set(refs.booking,'),'Canonical match MUST precede any writes');
 assert.match(txn,/tx\.set\(refs\.booking,/);
 assert.match(txn,/tx\.set\(refs\.driverClaim,/);
 assert.match(txn,/return \{committed:true,\.\.\.confirmation\};/);
 assert.doesNotMatch(txn,/applied:\s*true/);
});
test('Firestore Rules must enforce atomic reverse claim and source-linked approval',()=>{
 assert.match(rules,/match \/bookings\/\{bookingId\}/);
 assert.match(rules,/&& canonicalImportActive\(\)/);
 assert.match(rules,/existsAfter\(\/databases\/\$\(database\)\/documents\/driverClaims\//);
 assert.match(rules,/match \/driverClaims\/\{key\}/);
 assert.match(rules,/request\.resource\.data\.migrationSourceSha256 == resource\.data\.migrationSourceSha256/);
});
