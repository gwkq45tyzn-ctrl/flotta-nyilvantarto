// Verify that all safety-critical mobile and morning-return actions use
// live, server-confirmed source metadata before file uploads or writes.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assessSources} from '../../../depokapacitas/source-health.mjs';
const app=readFileSync(new URL('./app.mjs',import.meta.url),'utf8');
const specs=[
 ['checkin','async function checkin(e){','async function checkout(e){',/(?:sourcesTrusted|ensureAttendanceSources)\(COURIER_SOURCES\)/,/uploadPhotos\(files,sessionId,'in'\)/],
 ['checkout','async function checkout(e){','async function reviewOne(',/(?:sourcesTrusted|ensureAttendanceSources)\(COURIER_SOURCES\)/,/uploadPhotos\(files,session.id,'out'\)/],
 ['morning return','async function reviewOne(', "$('loginForm').addEventListener",/(?:sourcesTrusted|ensureAttendanceSources)\(STAFF_SOURCES\)/,/runTransaction\(db/]
];
for(const [label,start,end,gate,action] of specs){
 const from=app.indexOf(start),to=app.indexOf(end,from+start.length);
 assert.ok(from>=0&&to>from,label+': function boundary missing');
 const body=app.slice(from,to);
 assert.match(body,gate,label+': missing live metadata gate');
 assert.match(body,action,label+': missing protected action');
 assert.ok(body.search(gate)<body.search(action),label+': gate must precede action');
}
assert.match(app,/onSnapshot\(path,\{includeMetadataChanges:true\}/);
assert.match(app,/fromCache:meta\.fromCache,pending:meta\.hasPendingWrites/);
assert.match(app,/show\('checkinSection',false\);show\('checkoutSection',false\)/);
assert.match(app,/show\('bulkPanel',false\)/);
assert.match(app,/await ensureAttendanceSources\(STAFF_SOURCES\)/);
const required=['vehicles','locks','courierClaim','sessions'];
const ready=Object.fromEntries(required.map(x=>[x,{loaded:true,error:false,fromCache:false,pending:false,serverAt:Date.now()}]));
assert.equal(assessSources(ready,{required}).trusted,true);
assert.equal(assessSources({...ready,locks:{...ready.locks,fromCache:true}},{required}).trusted,false);
assert.equal(assessSources({...ready,sessions:{...ready.sessions,pending:true}},{required}).trusted,false);
assert.equal(assessSources({...ready,courierClaim:{...ready.courierClaim,loaded:false}},{required}).trusted,false);
assert.equal(assessSources(ready,{required,online:false}).trusted,false);
console.log('PASS: no cached/offline/pending courier or staff check-in, checkout and return clearance');
