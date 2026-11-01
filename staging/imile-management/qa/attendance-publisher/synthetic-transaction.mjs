/** #30 isolated transaction rehearsal. Never creates a booking-authorizing receipt.
 * No Google/ADC/IAM client, endpoint or deployed entry point belongs in this module.
 * Full history lives in ONE bounded QA aggregate, not a last-row watermark.
 * Production needs a reviewed persistent history/ingestion/fencing design instead.
 */
import {createHash} from 'node:crypto';
import {planAttendanceAtomicGuard} from '../../../../depokapacitas/attendance-atomic-plan.mjs';

export const SOURCE_PATH='qaAtomicSources/SYNTHETIC_TEST';
const eventKeys=['id','daCode','eventTime','eventDate','timeKnown','vehicleId','type',
 'status','photoFront','photoLeft','photoRight','photoBack','source'];
export function fail(code){throw new Error(code);}
const integer=n=>Number.isSafeInteger(n)&&n>=0&&n<Number.MAX_SAFE_INTEGER;
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?
 Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
export const digest=value=>createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
export function assertSyntheticEvent(e){
 if(!e||typeof e!=='object'||Object.keys(e).some(k=>!eventKeys.includes(k))||
  !/^QA_[A-Z0-9_]{1,100}$/.test(e.id)||!/^QA_DA_\d{2}$/.test(e.daCode)||
  (e.vehicleId!==undefined&&!/^QA\d{4}$/.test(e.vehicleId))||
  e.source!=='qa_synthetic'||e.status!=='SYNTHETIC'||
  ['photoFront','photoLeft','photoRight','photoBack'].some(k=>
   e[k]!==''&&e[k]!=='SYNTHETIC_PHOTO'))fail('synthetic_event_required');
}
export function assertSnapshot(s,now){
 if(!s||s.mode!=='synthetic-emulator-only'||!integer(s.revision)||
  !integer(s.sourceRevision)||!integer(s.epoch)||s.completeHistory!==true||
  s.pendingSourceChanges!==0||!Number.isFinite(s.observedAt)||
  s.observedAt>now||now-s.observedAt>120000)fail('unverified_qa_source');
 if(!Array.isArray(s.events)||s.events.length>100||!Array.isArray(s.drivers)||
  !Array.isArray(s.vehicles)||s.drivers.length>20||s.vehicles.length>20)
  fail('bounded_complete_history_required');
 const ids=new Set();for(const e of s.events){assertSyntheticEvent(e);
  if(ids.has(e.id))fail('duplicate_source_event');ids.add(e.id);}
 if(s.drivers.some(d=>Object.keys(d).some(k=>!['id','daCode','active','capacity'].includes(k))||
  !/^QA_DA_\d{2}$/.test(d.daCode)||d.id!==d.daCode||typeof d.active!=='boolean'||
  !Number.isSafeInteger(d.capacity)||d.capacity<0||d.capacity>1000)||
  s.vehicles.some(v=>Object.keys(v).some(k=>!['id','plate','status'].includes(k))||
  !/^QA\d{4}$/.test(v.plate)||v.id!==v.plate||!['Elérhető','Szerviz'].includes(v.status)))
  fail('synthetic_master_required');
 if(new Set(s.drivers.map(x=>x.id)).size!==s.drivers.length||
  new Set(s.vehicles.map(x=>x.id)).size!==s.vehicles.length)fail('duplicate_master');
 if(s.historyDigest!==digest(s.events))fail('history_digest_mismatch');
}
export function requestDigest(request){return digest(request);}
/** Builds a QA-only same-commit event + projection + revision + audit batch.
 * expectedEventDigest is required for correction/deletion, preventing a late
 * retry from overwriting a newer correction. Existing #29 policy stays intact.
 */
export function prepareSyntheticTransaction({snapshot,request,priorAudit,now}){
 if(!Number.isFinite(now))fail('invalid_clock');
 if(!request||Object.keys(request).some(k=>!['id','epoch','expectedRevision',
  'expectedSourceRevision','date','vehicleId','mutation','expectedEventDigest'].includes(k))||
  !/^QA_MUT_[A-Z0-9_]{1,80}$/.test(request.id)||!/^QA\d{4}$/.test(request.vehicleId)||
  !integer(request.epoch)||!integer(request.expectedRevision)||!integer(request.expectedSourceRevision))
  fail('invalid_request');
 const hash=requestDigest(request);
 // Epoch is checked BEFORE idempotency: a revoked writer cannot replay a receipt.
 if(!snapshot||request.epoch!==snapshot.epoch)fail('writer_fenced');
 if(priorAudit){
  if(priorAudit.requestDigest!==hash)fail('mutation_id_collision');
  return {duplicate:true,result:priorAudit.result,writes:[]};
 }
 assertSnapshot(snapshot,now);
 if(request.expectedRevision!==snapshot.revision||
  request.expectedSourceRevision!==snapshot.sourceRevision)fail('source_revision_conflict');
 const m=request.mutation;
 if(!m||Object.keys(m).some(k=>!['action','eventId','event'].includes(k))||
  !['upsert','delete'].includes(m.action)||!/^QA_[A-Z0-9_]{1,100}$/.test(m.eventId))
  fail('invalid_mutation');
 const before=snapshot.events.find(e=>e.id===m.eventId);
 if(before){if(request.expectedEventDigest!==digest(before))fail('event_revision_conflict');}
 else if(request.expectedEventDigest!==null)fail('event_revision_conflict');
 const events=snapshot.events.filter(e=>e.id!==m.eventId);
 if(m.action==='upsert'){
  assertSyntheticEvent(m.event);if(m.event.id!==m.eventId)fail('event_id_mismatch');
  events.push(structuredClone(m.event));
 }else if(m.event!==undefined||!before)fail('delete_event_missing');
 if(events.length>100)fail('bounded_complete_history_required');
 const plan=planAttendanceAtomicGuard({date:request.date,vehicleId:request.vehicleId,
  events,originalEvents:snapshot.events,drivers:snapshot.drivers,vehicles:snapshot.vehicles,
  now,mutation:m,proof:{fullVehicleEventHistory:true,includesOpenPriorDayHandovers:true,
   // These flags describe this isolated QA transaction ONLY, not real IAM/Google.
   allIamAndBrowserWritersFenced:true,consistentReadWithinTransaction:true,
   sourceGenerationVerified:true,sourceRevision:snapshot.sourceRevision,pendingSourceChanges:0}});
 if(!plan.writeIntent)fail(plan.reason);
 const nextRevision=snapshot.revision+1,nextSourceRevision=snapshot.sourceRevision+1;
 if(!integer(nextRevision)||!integer(nextSourceRevision))fail('revision_exhausted');
 const result={mode:'synthetic-emulator-only',authorizedForBooking:false,
  revision:nextRevision,sourceRevision:nextSourceRevision,state:plan.guardIntent.state};
 const projection={...plan.guardIntent,source:'qa-attendance-projection-v1',
  authorizedForBooking:false,qaComputedAt:now,sourceRevision:nextSourceRevision};
 const audit={requestDigest:hash,result,epoch:snapshot.epoch};
 return {duplicate:false,result,writes:[
  m.action==='delete'?{delete:'qaAtomicEvents/'+m.eventId}:
   {path:'qaAtomicEvents/'+m.eventId,data:m.event},
  {path:'qaAtomicProjections/'+request.date+'__'+request.vehicleId,data:projection},
  {path:SOURCE_PATH,data:{...snapshot,events,historyDigest:digest(events),
   revision:nextRevision,sourceRevision:nextSourceRevision}},
  {path:'qaAtomicAudit/'+request.id,data:audit}
 ]};
}
