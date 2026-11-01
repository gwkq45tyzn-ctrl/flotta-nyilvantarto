/**
 * STAGING-ONLY, OFFLINE DESIGN CONTRACT.
 * Pure validation of a proposed Attendance mutation and its SAME-COMMIT
 * projection. It cannot authenticate an IAM writer, transact with Firestore,
 * read Google Sheets or publish a receipt. Do not deploy or call it a writer.
 *
 * An authorized publisher must hold a lock/transaction on the COMPLETE source
 * generation, fence every alternate IAM writer, and commit BOTH mutations
 * atomically. This module never emits confirmedAt or an authoritative receipt.
 */
import {deriveAttendanceHandovers,normalizeAttendanceVehicleEvent} from
 '../staging/imile-management/attendance-handover.mjs';
import {depotDay} from './booking-occupancy.mjs';

const plate=value=>String(value??'').trim().toUpperCase().replace(/[\s-]+/g,'');
const matchPlate=value=>/^[A-Z0-9]{4,12}$/.test(value);
const dayValid=value=>{
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const d=new Date(value+'T12:00:00Z');
 return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value;
};
const eventFingerprint=e=>JSON.stringify([
 e.eventTime,e.eventDate,e.timeKnown,e.daCode,e.vehicleId,e.type,
 e.status,e.photoFront,e.photoLeft,e.photoRight,e.photoBack,e.source
]);
function normalizedEvents(events){
 const map=new Map(),errors=[];
 if(!Array.isArray(events))return {events:[],errors:['event_collection_missing']};
 for(const raw of events){
  const parsed=normalizeAttendanceVehicleEvent(raw);
  if(!parsed.valid){errors.push('invalid_event');continue;}
  const key=parsed.id,fingerprint=eventFingerprint(raw);
  const seen=map.get(key);
  if(seen){
   if(seen.fingerprint!==fingerprint)errors.push('event_id_collision');
   continue; // Idempotent retry never counts as a second physical issue.
  }
  map.set(key,{fingerprint,event:raw});
 }
 return {events:[...map.values()].map(x=>x.event),errors};
}
function proofValid(proof){
 return proof?.fullVehicleEventHistory===true&&
  proof?.includesOpenPriorDayHandovers===true&&
  proof?.allIamAndBrowserWritersFenced===true&&
  proof?.consistentReadWithinTransaction===true&&
  proof?.sourceGenerationVerified===true&&
  Number.isSafeInteger(proof?.sourceRevision)&&proof.sourceRevision>=0&&
  proof.sourceRevision<Number.MAX_SAFE_INTEGER&&
  proof.pendingSourceChanges===0;
}
/**
 * A provisional plan is never a trusted guard. In particular, its intent has
 * no confirmedAt and therefore cannot pass the Rules guard freshness check.
 */
export function planAttendanceAtomicGuard({
 date,vehicleId,events,drivers=[],vehicles=[],proof,now=Date.now(),
 mutation,originalEvents
}={}){
 const key=plate(vehicleId);
 const deny=reason=>Object.freeze({
  eligible:false,authorizedForBooking:false,reason,
  guardIntent:null,writeIntent:null
 });
 if(!dayValid(date)||!matchPlate(key)||!Number.isFinite(now))
  return deny('invalid_parameters');
 if(depotDay(now)!==date)return deny('not_current_budapest_day');
 if(!proofValid(proof))return deny('unverified_authoritative_history');
 if(!Array.isArray(drivers)||!Array.isArray(vehicles))return deny('invalid_master_sources');
 if(!Array.isArray(events))return deny('missing_event_snapshot');
 const parsed=normalizedEvents(events);
 if(parsed.errors.length)return deny(parsed.errors[0]);
 // A local 02:00-02:59 occurs twice on the last Sunday of October. The
 // historical Google source contains wall clock only, not the offset.
 // Never infer ordering or issue a clear intent from this ambiguous hour.
 const ambiguousLocalTime=time=>{
  const year=Number(time.slice(0,4));
  const lastSunday=31-new Date(Date.UTC(year,9,31)).getUTCDay();
  return time.slice(5,7)==='10'&&Number(time.slice(8,10))===lastSunday&&
   time.slice(11,13)==='02';
 };
 if(parsed.events.some(e=>ambiguousLocalTime(e.eventTime)))
  return deny('ambiguous_dst_attendance_time');
 if(parsed.events.some(e=>e.eventDate!==e.eventTime.slice(0,10)))
  return deny('inconsistent_event_day');
 // Event timestamps are local Europe/Budapest wall time in this source.
 // A future-dated/clock-future event cannot certify the current projection.
 const localNow=new Intl.DateTimeFormat('sv-SE',{
  timeZone:'Europe/Budapest',year:'numeric',month:'2-digit',day:'2-digit',
  hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'
 }).format(new Date(now)).replace(' ','T');
 if(parsed.events.some(e=>e.eventTime>localNow))
  return deny('future_attendance_event');
 if(!vehicles.some(v=>plate(v.plate||v.id)===key&&v.status==='Elérhető'))
  return deny('vehicle_unavailable');
 const reduced=deriveAttendanceHandovers({
  events:parsed.events,drivers,vehicles
 });
 // Any uncertain vehicle-bearing event in the historical stream must block
 // clearance. No silent recovery by discarding a contradiction.
 const eventById=new Map(parsed.events.map(e=>[e.id,e]));
 const relevantAlerts=reduced.alerts.filter(a=>{
  const e=eventById.get(a.eventId);
  return e&&plate(e.vehicleId)===key;
 });
 let state='clear',driverId='';
 if(relevantAlerts.length)state='blocked';
 const open=reduced.handovers.filter(h=>plate(h.vehicleId)===key&&
  (h.status==='issued'||h.status==='return_review'));
 if(open.length>1)state='blocked';
 if(open.length===1){
  if(state!=='blocked'){state='assigned';driverId=open[0].driverId;}
 }
 const guardIntent=Object.freeze({
  date,vehicleId:key,state,driverId,
  source:'trusted-attendance-projection-v1'
  // confirmedAt MUST be set from authoritative server time inside same commit.
 });
 // Guard alone is never sufficient: mutations must be audited and serialized
 // against a snapshot revision; source events are maintained in same commit.
 let writeIntent=null;
 if(mutation!==undefined){
  if(!mutation||!['upsert','delete'].includes(mutation.action)||
   !/^[A-Za-z0-9_-]{3,150}$/.test(String(mutation.eventId||'')))
   return deny('invalid_mutation');
  if(!Array.isArray(originalEvents))return deny('original_snapshot_missing');
  const old=normalizedEvents(originalEvents);
  if(old.errors.length)return deny('invalid_original_snapshot');
  const before=old.events.find(e=>e.id===mutation.eventId);
  const after=parsed.events.find(e=>e.id===mutation.eventId);
  // The proposed same-commit mutation must affect exactly this event;
  // changes to other event IDs require their own projection/revision checks.
  const previous=new Map(old.events.map(e=>[e.id,eventFingerprint(e)]));
  const proposed=new Map(parsed.events.map(e=>[e.id,eventFingerprint(e)]));
  const changedIds=[...new Set([...previous.keys(),...proposed.keys()])]
   .filter(id=>previous.get(id)!==proposed.get(id));
  if(changedIds.length!==1||changedIds[0]!==mutation.eventId)
   return deny('multiple_or_missing_event_changes');
  if(mutation.action==='upsert'&&!after)return deny('updated_event_missing');
  if(mutation.action==='delete'&&after)return deny('deleted_event_still_present');
  if(mutation.action==='delete'&&!before)return deny('event_to_delete_missing');
  // Do not accept a vehicle reassignment silently: the original vehicle
  // must also be reprojected as part of the same authoritative transaction.
  const changedVehicles=[...new Set([plate(before?.vehicleId),plate(after?.vehicleId)].filter(Boolean))];
  if(changedVehicles.some(k=>k!==key))return deny('multi_vehicle_reprojection_required');
  writeIntent=Object.freeze({
   eventPath:'attendance/'+mutation.eventId,
   eventAction:mutation.action,
   projectionPath:'attendanceVehicleGuards/'+date+'__'+key,
   revisionBefore:proof.sourceRevision,
   revisionAfter:proof.sourceRevision+1,
   bothWritesInOneCommitRequired:true,
   serverTimestampRequired:true,
   committableWithoutAuthorizedPublisher:false
  });
 }
 return Object.freeze({
  eligible:state!=='blocked',reason:state==='blocked'?'attendance_requires_review':'provisional_only',
  guardIntent,writeIntent,
  // Even clear/assigned is only a proposed state, NOT a trusted server receipt.
  authorizedForBooking:false,
  sourceEventsExamined:parsed.events.length
 });
}
