// Pure source-contract regression. Real Firestore/mobile runtime remains a
// Work staging gate; this test never fetches external data.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assessSources} from '../../../depokapacitas/source-health.mjs';
const script=readFileSync(new URL('./app.mjs',import.meta.url),'utf8');
const html=readFileSync(new URL('./index.html',import.meta.url),'utf8');
const slice=(a,b)=>{const start=script.indexOf(a),end=script.indexOf(b,start+1);assert.ok(start>=0&&end>start,a+' boundary');return script.slice(start,end);};
const refresh=slice('async function refreshAttendanceSources(){','async function ensureAttendanceSources(');
assert.match(refresh,/getDocFromServer\(reference\)/);
assert.match(refresh,/getDocsFromServer\(reference\)/);
assert.match(refresh,/await Promise\.all\(targets\.map/);
assert.match(refresh,/user\.uid!==principal\|\|isStaff!==principalIsStaff/);
assert.match(refresh,/for\(let i=0;i<targets\.length;i\+\+\)/);
assert.ok(refresh.indexOf('await Promise.all(')<refresh.indexOf('const receivedAt=Date.now()'),
 'All source reads must finish before any UI state is considered trusted');
assert.match(script,/await ensureAttendanceSources\(COURIER_SOURCES\)/);
assert.match(script,/await ensureAttendanceSources\(STAFF_SOURCES\)/);
const checkin=slice('async function checkin(e){','async function checkout(e){');
const checkout=slice('async function checkout(e){','async function reviewOne(');
assert.ok(checkin.indexOf('await ensureAttendanceSources(')<checkin.indexOf('uploadPhotos('));
assert.ok(checkout.indexOf('await ensureAttendanceSources(')<checkout.indexOf('uploadPhotos('));
assert.match(html,/id="refreshAttendanceData"/);
assert.match(script,/if\(isStaff\)resetBulkApproval\(\)/);
assert.match(script,/const sameWaitingList=lastWaitingSignature===signature/);
assert.match(script,/if\(!sourcesTrusted\(STAFF_SOURCES\)\)\{\s*resetBulkApproval\(\)/);
assert.match(script,/document\.addEventListener\('visibilitychange'/);
assert.ok(!script.includes("setBusy(true);render();}"),
 'Snapshot errors should not permanently prevent explicit refresh');
const keys=['vehicles','locks','courierClaim','sessions'];
const now=Date.now();
const ok=Object.fromEntries(keys.map(k=>[k,{loaded:true,error:false,pending:false,fromCache:false,serverAt:now-60000}]));
assert.equal(assessSources(ok,{required:keys,now}).trusted,true);
assert.equal(assessSources(ok,{required:keys,now:now+16*60000}).trusted,false);
assert.equal(assessSources(ok,{required:keys,online:false}).trusted,false);
console.log('PASS: long-shift server refresh, identity fencing, and bulk return confirmation invalidation');
