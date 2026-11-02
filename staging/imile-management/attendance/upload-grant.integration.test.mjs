import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8');
const storage=read('./storage.rules'),rules=read('../../../depokapacitas/firestore.rules'),app=read('./app.mjs');
test('Storage create uses exactly the two bounded PR59 document paths per stage',()=>{
 const permit=storage.slice(storage.indexOf('function permittedUpload('),storage.indexOf('function allowedPhotoStage('));
 const stage=storage.slice(storage.indexOf('function allowedPhotoStage('),storage.indexOf('match /attendance/'));
 assert.deepEqual([...new Set([...permit.matchAll(/documents\/([A-Za-z]+)/g)].map(m=>m[1]))],['courierAccess']);
 assert.deepEqual([...new Set([...stage.matchAll(/documents\/([A-Za-z]+)/g)].map(m=>m[1]))].sort(),['courierAccess','courierLocks','vehicleSessions']);
 assert.match(stage,/stage == 'in'\s*\? !firestore.exists\([^\n]*courierLocks/);
 assert.match(stage,/let s = [^\n]*vehicleSessions/);assert.match(stage,/driverId == firestore.get\(access\).data.driverId/);
 assert.doesNotMatch(storage,/documents\/(vehicleLocks|driverLocks|drivers|vehicles)\//);
 assert.match(storage,/permittedUpload\(uid,sid,stage\) && allowedPhotoStage\(uid,sid,stage\)/);
});
test('all browser quota-control writes and access capability edits are denied',()=>{
 assert.match(rules,/affectedKeys\(\).hasOnly\(\['uid','driverId','active'\]\)/);
 for(const c of ['Quotas','Leases','Requests','Policy','AdminOps'])assert.match(rules,new RegExp('match /photoUpload'+c+'/\\{id\\} \\{ allow read: if admin\\(\\); allow write: if false; \\}'));
 assert.match(rules,/&& validPhotoPermit\(uid,sid,stage\)/);
});
test('PWA obtains server session before upload and uses out authorization on same session',()=>{
 assert.doesNotMatch(app,/sessionId:'s_'\+crypto/);
 const start=app.slice(app.indexOf('async function checkin(e){'),app.indexOf('async function checkout(e){'));
 assert.ok(start.indexOf('await requestPhotoPermit(')<start.indexOf("await uploadPhotos(files,sessionId,'in')"));
 const end=app.slice(app.indexOf('async function checkout(e){'),app.indexOf('async function reviewOne('));
 assert.ok(end.indexOf('await requestPhotoPermit(')<end.indexOf("await uploadPhotos(files,session.id,'out')"));
 assert.match(app,/if\(user\?\.uid!==actor\)throw Error/);
});
