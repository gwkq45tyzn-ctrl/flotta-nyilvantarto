/** Real local Firestore transactions, no cloud project or credentials. */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createEmulatorStore} from './emulator-store.mjs';
import {digest,SOURCE_PATH} from './synthetic-transaction.mjs';
import {NOW,DAY,event,snapshot,request,photos} from './fixtures.mjs';
const host=process.env.FIRESTORE_EMULATOR_HOST;
const projectId='demo-imile-attendance-atomic';
const store=createEmulatorStore({host,projectId});
const projection='qaAtomicProjections/'+DAY+'__QA0001';
let n=0;const req=(e,changes={})=>request(e,{id:'QA_MUT_CASE_'+(++n),...changes});
test('real transaction persists all four QA records consistently',async()=>{
 await store.seed(snapshot());const r=req(event('QA_ATOMIC'));
 const result=await store.transact(r,{now:NOW});assert.equal(result.state,'assigned');
 const [s,e,p,a]=await Promise.all([store.read(SOURCE_PATH),store.read('qaAtomicEvents/QA_ATOMIC'),
  store.read(projection),store.read('qaAtomicAudit/'+r.id)]);
 assert.equal(s.revision,1);assert.equal(s.sourceRevision,1);assert.deepEqual(s.events,[e]);
 assert.equal(p.sourceRevision,s.sourceRevision);assert.equal(a.result.revision,s.revision);
 assert.equal(p.authorizedForBooking,false);assert.equal('confirmedAt'in p,false);
});
test('repeat mutation reads its audit without another commit or timestamp renewal',async()=>{
 await store.seed(snapshot());const r=req(event('QA_REPEAT'));
 await store.transact(r,{now:NOW});const p=await store.read(projection);
 const retry=await store.transact(r,{now:NOW+999999});
 assert.equal(retry.duplicate,true);assert.equal((await store.read(SOURCE_PATH)).revision,1);
 assert.deepEqual(await store.read(projection),p);
});
test('mutation ID collision has no partial event/source write',async()=>{
 await store.seed(snapshot());const r=req(event('QA_FIRST'));
 await store.transact(r,{now:NOW});const s=await store.read(SOURCE_PATH);
 await assert.rejects(store.transact({...r,mutation:{action:'upsert',eventId:'QA_COLLIDE',event:event('QA_COLLIDE')}},
  {now:NOW}),/mutation_id_collision/);
 assert.equal(await store.read('qaAtomicEvents/QA_COLLIDE'),null);
 assert.deepEqual(await store.read(SOURCE_PATH),s);
});
test('revoked epoch is rejected before any event write',async()=>{
 await store.seed(snapshot([],{epoch:2}));const r=req(event('QA_FENCED'));
 await assert.rejects(store.transact(r,{now:NOW}),/writer_fenced/);
 assert.equal(await store.read('qaAtomicEvents/QA_FENCED'),null);
});
test('source correction with stale expected generation is rejected',async()=>{
 await store.seed(snapshot([],{sourceRevision:2}));const r=req(event('QA_STALE'));
 await assert.rejects(store.transact(r,{now:NOW}),/source_revision_conflict/);
 assert.equal((await store.read(SOURCE_PATH)).sourceRevision,2);
});
test('concurrent writers serialize: exactly one expected revision commits',async()=>{
 await store.seed(snapshot());
 const a=req(event('QA_RACE_A')),b=req(event('QA_RACE_B',{vehicleId:'QA0002',daCode:'QA_DA_02'}),{vehicleId:'QA0002'});
 const results=await Promise.allSettled([store.transact(a,{now:NOW}),store.transact(b,{now:NOW})]);
 assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
 const failed=results.find(x=>x.status==='rejected');assert.match(failed.reason.message,/source_revision_conflict/);
 const s=await store.read(SOURCE_PATH);assert.equal(s.revision,1);assert.equal(s.events.length,1);
 const aud=[await store.read('qaAtomicAudit/'+a.id),await store.read('qaAtomicAudit/'+b.id)];
 assert.equal(aud.filter(Boolean).length,1);
});
test('same-request concurrent retry commits once and reads the winning audit',async()=>{
 await store.seed(snapshot());const r=req(event('QA_SAME_RACE'));
 const results=await Promise.all([store.transact(r,{now:NOW}),store.transact(r,{now:NOW})]);
 assert.equal(results.filter(x=>x.duplicate).length,1);
 assert.equal((await store.read(SOURCE_PATH)).revision,1);
});
test('injected precommit crash rolls back event/projection/revision/audit together',async()=>{
 await store.seed(snapshot());const r=req(event('QA_CRASH'));
 const before=await store.read(projection);
 await assert.rejects(store.transact(r,{now:NOW,beforeCommit(){throw Error('SYNTHETIC_FAILURE')}}),/SYNTHETIC_FAILURE/);
 assert.equal(await store.read('qaAtomicEvents/QA_CRASH'),null);
 assert.equal(await store.read('qaAtomicAudit/'+r.id),null);
 assert.equal((await store.read(SOURCE_PATH)).revision,0);assert.deepEqual(await store.read(projection),before);
});
test('late insert and plate-less complete return use prior-day full history',async()=>{
 const prior=event('QA_PREV_DAY',{eventTime:'2026-10-31T09:00:00',eventDate:'2026-10-31'});
 await store.seed(snapshot([prior]));
 const out=event('QA_PREV_RETURN',{type:'Log Out',eventTime:DAY+'T10:00:00',...photos});delete out.vehicleId;
 const result=await store.transact(req(out),{now:NOW});assert.equal(result.state,'clear');
 const s=await store.read(SOURCE_PATH);assert.equal(s.events.length,2);
});
test('missing photos block until exact source-event correction is committed',async()=>{
 const login=event('QA_PHOTO_IN'),out=event('QA_PHOTO_OUT',{type:'Log Out',eventTime:DAY+'T10:00:00'});
 await store.seed(snapshot([login]));
 assert.equal((await store.transact(req(out),{now:NOW})).state,'blocked');
 const correction=req({...out,...photos},{expectedRevision:1,expectedSourceRevision:1,expectedEventDigest:digest(out)});
 assert.equal((await store.transact(correction,{now:NOW})).state,'clear');
 assert.equal((await store.read(projection)).sourceRevision,2);
});
test('deleting return reopens physical use atomically and deletes mirror event',async()=>{
 const login=event('QA_DELETE_IN'),out=event('QA_DELETE_OUT',{type:'Log Out',eventTime:DAY+'T10:00:00',...photos});
 await store.seed(snapshot([login]));await store.transact(req(out),{now:NOW});
 const del=req(undefined,{expectedRevision:1,expectedSourceRevision:1,expectedEventDigest:digest(out),
  mutation:{action:'delete',eventId:out.id}});
 assert.equal((await store.transact(del,{now:NOW})).state,'assigned');
 assert.equal(await store.read('qaAtomicEvents/'+out.id),null);
 assert.equal((await store.read(SOURCE_PATH)).events.length,1);
});
test('missing/old source proof never refreshes the QA projection',async()=>{
 await store.seed(snapshot());const before=await store.read(projection);
 await assert.rejects(store.transact(req(event('QA_EXPIRED')),{now:NOW+120001}),/unverified_qa_source/);
 assert.deepEqual(await store.read(projection),before);
});
test('unresolved plate-less return and multi-car correction fail without writes',async()=>{
 const out=event('QA_UNRESOLVED',{type:'Log Out',...photos});delete out.vehicleId;
 await store.seed(snapshot());await assert.rejects(store.transact(req(out),{now:NOW}),/unresolved_checkout_vehicle/);
 const before=event('QA_MOVE');await store.seed(snapshot([before]));
 await assert.rejects(store.transact(req({...before,vehicleId:'QA0002'},
  {expectedEventDigest:digest(before)}),{now:NOW}),/multi_vehicle_reprojection_required/);
 assert.equal((await store.read(SOURCE_PATH)).revision,0);
});
test('path whitelist rejects production collections before network access',async()=>{
 await assert.rejects(store.read('attendance/QA_LOGIN'),/qa_path_required/);
 await assert.rejects(store.read('attendanceVehicleGuards/'+DAY+'__QA0001'),/qa_path_required/);
});
test('actual emulator commit precondition failure applies none of its writes',async()=>{
 const base='http://'+host+'/v1/projects/'+projectId+'/databases/(default)/documents';
 const name='projects/'+projectId+'/databases/(default)/documents/';
 const result=await fetch(base+':commit',{method:'POST',redirect:'error',headers:{'Content-Type':'application/json',
  Authorization:'Bearer owner'},body:JSON.stringify({writes:[
   {update:{name:name+'qaAtomicEvents/QA_ROLLBACK',fields:{source:{stringValue:'qa_synthetic'}}}},
   {update:{name:name+'qaAtomicEvents/QA_NEVER_EXISTS',fields:{}},currentDocument:{exists:true}}
  ]})});
 assert.equal(result.ok,false);assert.equal(await store.read('qaAtomicEvents/QA_ROLLBACK'),null);
});
test('production-named event and guard collections remain empty',async()=>{
 for(const c of ['attendance','attendanceVehicleGuards']){
  const r=await fetch('http://'+host+'/v1/projects/'+projectId+'/databases/(default)/documents/'+c,
   {redirect:'error',headers:{Authorization:'Bearer owner'}});
  assert.equal(r.ok,true);assert.equal(((await r.json()).documents||[]).length,0);
 }
});
