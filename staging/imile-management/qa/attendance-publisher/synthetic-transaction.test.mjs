import assert from 'node:assert/strict';
import {test} from 'node:test';
import {prepareSyntheticTransaction as prepare,digest,SOURCE_PATH} from './synthetic-transaction.mjs';
import {createEmulatorStore} from './emulator-store.mjs';
import {NOW,DAY,event,snapshot,request,photos} from './fixtures.mjs';
const run=(s=snapshot(),r=request(),extra={})=>prepare({snapshot:s,request:r,now:NOW,...extra});
const denied=(s,r,reason)=>assert.throws(()=>run(s,r),new RegExp(reason));
test('event, projection, source generation and audit form one QA batch',()=>{
 const p=run();assert.equal(p.writes.length,4);assert.equal(p.result.authorizedForBooking,false);
 assert.equal(p.result.state,'assigned');assert.equal(p.result.sourceRevision,1);
 assert.deepEqual(p.writes.map(x=>x.path),['qaAtomicEvents/QA_LOGIN',
  'qaAtomicProjections/'+DAY+'__QA0001',SOURCE_PATH,'qaAtomicAudit/QA_MUT_FIRST']);
 assert.doesNotMatch(JSON.stringify(p),/confirmedAt|trusted-attendance-projection/);
 assert.equal(p.writes[2].data.historyDigest,digest(p.writes[2].data.events));
});
test('idempotent retry is read-only and cannot renew freshness',()=>{
 const p=run(),s=p.writes[2].data,a=p.writes[3].data;
 const retry=run(s,request(),{priorAudit:a,now:NOW+999999});
 assert.equal(retry.duplicate,true);assert.deepEqual(retry.writes,[]);
 assert.equal(p.writes[1].data.qaComputedAt,NOW);
});
test('different payload cannot reuse mutation ID',()=>{
 const p=run();assert.throws(()=>run(p.writes[2].data,request(event('QA_OTHER')),
  {priorAudit:p.writes[3].data}),/mutation_id_collision/);
});
test('old epoch rejected including idempotent retry',()=>{
 const p=run();assert.throws(()=>run({...p.writes[2].data,epoch:2},request(),
  {priorAudit:p.writes[3].data}),/writer_fenced/);
});
test('stale source revision rejected',()=>denied(snapshot([], {sourceRevision:2}),request(),'source_revision_conflict'));
test('stale local revision rejected',()=>denied(snapshot([], {revision:2}),request(),'source_revision_conflict'));
for(const [name,change] of Object.entries({incomplete:{completeHistory:false},pending:{pendingSourceChanges:1},
 stale:{observedAt:NOW-120001},future:{observedAt:NOW+1},digest:{historyDigest:'bad'}}))
 test(name+' history cannot authorize a QA transaction',()=>denied(snapshot([],change),request(),
  name==='digest'?'history_digest_mismatch':'unverified_qa_source'));
test('late previous-day issue remains open',()=>{
 const prior=event('QA_PRIOR',{eventTime:'2026-10-31T09:00:00',eventDate:'2026-10-31'});
 const p=run(snapshot([prior]),request(event('QA_DUP')));
 assert.equal(p.result.state,'blocked');
});
test('complete plate-less return resolves through the unique source handover',()=>{
 const before=event(),after=event('QA_RETURN',{type:'Log Out',eventTime:DAY+'T10:00:00',...photos});
 delete after.vehicleId;const p=run(snapshot([before]),request(after));
 assert.equal(p.result.state,'clear');
});
test('missing return photos stay blocked',()=>{
 const p=run(snapshot([event()]),request(event('QA_RETURN',{type:'Log Out',eventTime:DAY+'T10:00:00'})));
 assert.equal(p.result.state,'blocked');
});
test('correction requires exact old event digest',()=>{
 const old=event();denied(snapshot([old]),request({...old,type:'Log Out'}),'event_revision_conflict');
});
test('photo correction is reprojected from complete history',()=>{
 const old=event('QA_RETURN',{type:'Log Out',eventTime:DAY+'T10:00:00'});
 const p=run(snapshot([event(),old]),request({...old,...photos},{expectedEventDigest:digest(old)}));
 assert.equal(p.result.state,'clear');
});
test('source deletion reverses prior clearance in same batch',()=>{
 const old=event('QA_RETURN',{type:'Log Out',eventTime:DAY+'T10:00:00',...photos});
 const p=run(snapshot([event(),old]),request(undefined,{expectedEventDigest:digest(old),
  mutation:{action:'delete',eventId:old.id}}));
 assert.equal(p.result.state,'assigned');assert.equal(p.writes[0].delete,'qaAtomicEvents/QA_RETURN');
});
test('vehicle reassignment stays blocked under existing #29 contract',()=>{
 const old=event();denied(snapshot([old]),request({...old,vehicleId:'QA0002'},
  {expectedEventDigest:digest(old)}),'multi_vehicle_reprojection_required');
});
test('ambiguous DST event cannot produce a QA projection',()=>{
 const old=event('QA_DST',{eventDate:'2026-10-25',eventTime:'2026-10-25T02:30:00'});
 denied(snapshot([old]),request(),'ambiguous_dst_attendance_time');
});
test('unknown car cannot produce clearance',()=>denied(snapshot(),request(event('QA_OTHER',{vehicleId:'QA0099'}),
 {vehicleId:'QA0099'}),'vehicle_unavailable'));
test('invalid calendar event is not discarded',()=>denied(snapshot(),request(event('QA_BAD',
 {eventTime:'2026-02-30T09:00:00',eventDate:'2026-02-30'})),'invalid_event'));
test('unscoped legacy return cannot produce clearance',()=>{
 const r=event('QA_ORPHAN',{type:'Log Out',...photos});delete r.vehicleId;
 denied(snapshot(),request(r),'unresolved_checkout_vehicle');
});
test('source ID collision/duplicate cannot be hidden',()=>denied(snapshot([event(),event()]),request(),
 'duplicate_source_event'));
test('personal/source rows outside the synthetic schema are rejected',()=>{
 denied(snapshot(),request(event('QA_PII',{driverName:'PRIVATE'})),'synthetic_event_required');
 denied(snapshot(),request(event('QA_PII',{photoFront:'https://real.invalid/photo'})),'synthetic_event_required');
});
test('no blank refresh/mutation can renew an unchanged source',()=>denied(snapshot([event()]),
 request(event(),{expectedEventDigest:digest(event())}),'multiple_or_missing_event_changes'));
test('history bound fails closed rather than truncating',()=>denied(snapshot(Array.from({length:101},(_,i)=>
 event('QA_'+i))),request(),'bounded_complete_history_required'));
test('unknown request options and requested production mode rejected',()=>{
 denied(snapshot(),{...request(),confirmedAt:NOW},'invalid_request');
 denied(snapshot([],{mode:'production'}),request(),'unverified_qa_source');
});
test('no cloud host, default project, ADC or remote emulator is accepted',()=>{
 for(const host of [undefined,'localhost:8080','0.0.0.0:8080','127.0.0.1:8080@evil.invalid',
 'firestore.googleapis.com','127.0.0.1:99999'])assert.throws(()=>createEmulatorStore({host,
  projectId:'demo-imile-attendance-atomic'}),/explicit_loopback_demo_target_required/);
 assert.throws(()=>createEmulatorStore({host:'127.0.0.1:8080',projectId:'imile-management-staging'}),
  /explicit_loopback_demo_target_required/);
});
