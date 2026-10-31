/**
 * SERVER-ONLY validation and transactional report archive design.
 * Requires authenticated server endpoint, verified Firebase token, and a
 * privileged Admin SDK Firestore instance. NOT used by browser; NEVER bundle.
 * Client-supplied totals, hashes, roles, timestamps and revision IDs are
 * never accepted as trusted values.
 */
import {createHash,randomBytes} from 'node:crypto';

export const VALIDATION_VERSION=1;
const DATE=/^20\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const DAY_LIMIT=10000000;
// Conservative limits: Firestore's array elements have protobuf overhead beyond JSON.
const MAX_ARCHIVE_JSON_BYTES=400000;
const MAX_INVENTORY_BUCKETS=10000;
const MAX_DOCUMENT_ID_UTF8_BYTES=1200;
const isDay=x=>typeof x==='string'&&DATE.test(x)&&
  new Date(x+'T12:00:00Z').toISOString().slice(0,10)===x;
const text=(x,max=160)=>typeof x==='string'&&x.length>0&&x.length<=max&&
  x===x.trim()&&!/[\u0000-\u001f\u007f]/.test(x);
const count=x=>Number.isSafeInteger(x)&&x>=0&&x<=DAY_LIMIT;
const fields=(x,names)=>x&&typeof x==='object'&&!Array.isArray(x)&&
  Object.keys(x).length===names.length&&names.every(k=>Object.hasOwn(x,k));
const same=(x,y)=>x.length===y.length&&x.every((v,i)=>v===y[i]);
const cmp=(a,b)=>a.localeCompare(b,'hu',{numeric:true});
export const reportKey=(date,station)=>{
 if(!isDay(date)||!text(station))throw new Error('invalid_day_or_station');
 const id=date+'__'+encodeURIComponent(station);
 if(Buffer.byteLength(id,'utf8')>500)throw new Error('station_key_too_long');
 return id;
};
export const hashText=value=>createHash('sha256').update(value,'utf8').digest('hex');

const withinArchiveLimit=value=>{
 if(Buffer.byteLength(JSON.stringify(value),'utf8')>MAX_ARCHIVE_JSON_BYTES)
  throw new Error('report_document_too_large');
 return value;
};
const strictFields={
 ofd:['key','date','station','rows','totalOFD','totalDelivered','courierCount'],
 inhub:['key','date','station','dates','areas','total']
};

export function validateTrustedReport(kind,candidate){
 if(!Object.hasOwn(strictFields,kind))throw new Error('invalid_report_kind');
 if(!fields(candidate,strictFields[kind]))throw new Error('invalid_report_shape');
 const {date,station,key}=candidate;
 if(key!==reportKey(date,station))throw new Error('invalid_daily_key');
 if(kind==='ofd'){
  if(!Array.isArray(candidate.rows)||candidate.rows.length===0||candidate.rows.length>300)
   throw new Error('invalid_courier_list');
  const seen=new Set(),rows=[];
  for(const row of candidate.rows){
   if(!fields(row,['daCode','daName','vendor','ofd','delivered'])||
    !text(row.daCode,80)||!text(row.daName)||!text(row.vendor)||
    !count(row.ofd)||!count(row.delivered)||row.delivered>row.ofd)
    throw new Error('invalid_courier_row');
   if(seen.has(row.daCode))throw new Error('duplicate_da_code');
   seen.add(row.daCode);
   rows.push({...row});
  }
  rows.sort((a,b)=>cmp(a.daCode,b.daCode));
  const ofd=rows.reduce((n,x)=>n+x.ofd,0),delivered=rows.reduce((n,x)=>n+x.delivered,0);
  if(!count(ofd)||!count(delivered)||candidate.totalOFD!==ofd||
   candidate.totalDelivered!==delivered||candidate.courierCount!==rows.length)
   throw new Error('untrusted_ofd_aggregate');
  const snapshot={key,date,station,rows,totalOFD:ofd,totalDelivered:delivered,courierCount:rows.length};
  const canonical=JSON.stringify({date,station,rows:rows.map(x=>[
   x.daCode,x.daName,x.vendor,x.ofd,x.delivered]),ofd,delivered});
  withinArchiveLimit(snapshot);
  return {kind,canonical,snapshot,contentHash:hashText(canonical)};
 }
 if(!Array.isArray(candidate.dates)||candidate.dates.length===0||candidate.dates.length>180||
  !candidate.dates.every(x=>isDay(x)&&x<=date)||
  new Set(candidate.dates).size!==candidate.dates.length||
  !same(candidate.dates,[...candidate.dates].sort()))
  throw new Error('invalid_receive_days');
 if(!Array.isArray(candidate.areas)||candidate.areas.length===0||candidate.areas.length>250||
  candidate.areas.length*candidate.dates.length>MAX_INVENTORY_BUCKETS)
  throw new Error('invalid_areas');
 const areas=[],seen=new Set();
 for(const row of candidate.areas){
  if(!fields(row,['area','counts'])||!text(row.area,160)||
   !Array.isArray(row.counts)||row.counts.length!==candidate.dates.length||
   !row.counts.every(count))throw new Error('invalid_area_row');
  if(seen.has(row.area))throw new Error('duplicate_area');
  seen.add(row.area);
  areas.push({area:row.area,counts:[...row.counts]});
 }
 areas.sort((a,b)=>cmp(a.area,b.area));
 const total=areas.reduce((n,row)=>n+row.counts.reduce((v,x)=>v+x,0),0);
 if(!count(total)||candidate.total!==total)throw new Error('untrusted_inventory_aggregate');
 const snapshot={key,date,station,dates:[...candidate.dates],areas,total};
 withinArchiveLimit(snapshot);
 const canonical=JSON.stringify({date,station,dates:snapshot.dates,
  areas:areas.map(x=>[x.area,...x.counts])});
 return {kind,canonical,snapshot,contentHash:hashText(canonical)};
}
export function archiveId(reportKey,version){
 if(!Number.isInteger(version)||version<1||version>1000000)throw new Error('invalid_version');
 // Encoded doc ID has no slash. Dates and station share a stable identity.
 const id=encodeURIComponent(reportKey)+'__v'+String(version).padStart(6,'0');
 if(Buffer.byteLength(id,'utf8')>MAX_DOCUMENT_ID_UTF8_BYTES)
  throw new Error('history_key_too_long');
 return id;
}
function checkPrevious(previous,kind,key){
 if(previous===null)return;
 if(!previous||previous.key!==key||!Number.isInteger(previous.version)||
  previous.version<1||previous.version>=1000000||
  typeof previous.contentHash!=='string'||
  !/^[a-f0-9]{64}$/.test(previous.contentHash))
  throw new Error('previous_snapshot_not_trustworthy');
 if(kind==='ofd'&&!['provisional','final'].includes(previous.status))
  throw new Error('invalid_previous_status');
}
/**
 * A pure dry-run used before Admin SDK writes.
 * Previous records from the browser-only staging period are labelled legacy
 * and retained verbatim, never represented as independently server-verified.
 */
export function planTrustedRevision({kind,candidate,previous=null,status=null,allowReplace=false,
 expectedVersion=null,actorUid,sourceName,forceRevision=false}){
 if(!text(actorUid,128)||!text(sourceName,200))throw new Error('invalid_actor_or_source');
 const v=validateTrustedReport(kind,candidate),key=v.snapshot.key;
 if(kind==='ofd'&&!['provisional','final'].includes(status))
  throw new Error('report_status_required');
 if(kind==='inhub'&&status!==null)throw new Error('inventory_has_no_final_flag');
 checkPrevious(previous,kind,key);
 if(previous){
  // Optimistic concurrency applies even to an otherwise identical retry.
  if(expectedVersion!==null&&expectedVersion!==previous.version)
   throw new Error('replacement_not_approved');
  // A browser-written legacy snapshot is NEVER upgraded to trusted by an
  // identical retry: explicitly approve a new server-validated revision.
  if(!forceRevision&&previous.validationSource==='server-aggregates-only'&&
   previous.contentHash===v.contentHash&&
   (kind==='inhub'||previous.status===status))
   return {result:'unchanged',version:previous.version,reportKey:key,contentHash:v.contentHash};
  if(!allowReplace||expectedVersion!==previous.version)throw new Error('replacement_not_approved');
  if(kind==='ofd'&&previous.status==='final'&&status!=='final')
   throw new Error('cannot_downgrade_final');
 }else if(expectedVersion!==null&&expectedVersion!==0)throw new Error('unexpected_version');
 const version=(previous?.version||0)+1;
 const verified={...v.snapshot,kind,contentHash:v.contentHash,status:kind==='ofd'?status:null,
  version,validationVersion:VALIDATION_VERSION,validationSource:'server-aggregates-only'};
 const history=withinArchiveLimit({...verified,actorUid,sourceName,
  previousHash:previous?.contentHash||''});
 const legacy=previous&&previous.validationSource!=='server-aggregates-only'
  ?{...previous,kind,validationSource:'legacy-unverified',archivedBy:actorUid}
  :null;
 return {result:'commit',kind,reportKey:key,version,contentHash:v.contentHash,
  current:verified,history,legacy,previousHash:previous?.contentHash||'',actorUid,sourceName};
}
/**
 * Must be called *only* from a trusted server after verifyIdToken(idToken).
 * db is a Firebase Admin Firestore instance; arbitrary clients may not call it.
 * The transaction reads role and current document before any writes.
 * Archived historical snapshots are complete, immutable document copies.
 */
export async function commitTrustedReport({db,verifiedUid,kind,candidate,status=null,
 allowReplace=false,expectedVersion=null,sourceName,requireAdmin=false,
 restoreFromVersion=null,restoreReason=null}){
 if(!db||typeof db.runTransaction!=='function'||!text(verifiedUid,128))
  throw new Error('server_auth_required');
 if(restoreFromVersion!==null&&(!requireAdmin||!allowReplace||
  !Number.isInteger(restoreFromVersion)||restoreFromVersion<1||
  !text(restoreReason,120)))throw new Error('invalid_restore_approval');
 const prefix=kind==='ofd'?'performance':'inventory';
 if(!['ofd','inhub'].includes(kind))throw new Error('invalid_report_kind');
 const key=reportKey(candidate?.date,candidate?.station);
 const col=kind==='ofd'?'performanceDays':'inventoryDays';
 const hist=kind==='ofd'?'performanceVersions':'inventoryVersions';
 const audits=prefix+'Audits';
 return db.runTransaction(async tx=>{
  const roleSnap=await tx.get(db.doc('users/'+verifiedUid));
  const role=roleSnap.exists?roleSnap.data():null;
  if(!role||role.active!==true||!['admin','editor'].includes(role.role)||
   (requireAdmin&&role.role!=='admin'))
   throw new Error('report_write_forbidden');
  const ref=db.doc(col+'/'+key);
  const record=await tx.get(ref);
  const previous=record.exists?record.data():null;
  const plan=planTrustedRevision({kind,candidate,previous,status,allowReplace,
   expectedVersion,actorUid:verifiedUid,sourceName,
   forceRevision:restoreFromVersion!==null});
  if(plan.result==='unchanged')return {status:'unchanged',version:plan.version,key};
  const auditId=randomBytes(10).toString('hex').toUpperCase();
  const newHistoryRef=db.doc(hist+'/'+archiveId(key,plan.version));
  // Read the possible legacy archive before any transaction writes.
  const legacyRef=plan.legacy?db.doc(hist+'/'+archiveId(key,previous.version)):null;
  const [historySnapshot,legacySnapshot]=await Promise.all([
   tx.get(newHistoryRef),legacyRef?tx.get(legacyRef):Promise.resolve(null)
  ]);
  if(historySnapshot.exists)throw new Error('history_revision_already_exists');
  const time=new Date();
  const auditRef=db.doc(audits+'/'+auditId);
  if(legacyRef&&!legacySnapshot.exists)tx.create(legacyRef,withinArchiveLimit({
   ...plan.legacy,archivedAt:time,unverifiedLegacy:true}));
  tx.create(newHistoryRef,{...plan.history,recordedAt:time,
   ...(restoreFromVersion!==null?{restoredFromVersion:restoreFromVersion,restoreReason}:{})});
  tx.set(ref,{...plan.current,sourceName,createdAt:previous?.createdAt||time,
   createdBy:previous?.createdBy||verifiedUid,updatedAt:time,updatedBy:verifiedUid,
   lastAuditId:auditId});
  tx.create(auditRef,{reportKey:key,version:plan.version,
   contentHash:plan.contentHash,priorHash:plan.previousHash,actor:verifiedUid,
   action:restoreFromVersion!==null?'restore':previous?'replace':'create',
   ...(restoreFromVersion!==null?{restoredFromVersion:restoreFromVersion,restoreReason}:{}),
   recordedAt:time,sourceName,
   archiveId:archiveId(key,plan.version)});
  return {status:'committed',version:plan.version,key,auditId};
 });
}


/**
 * Admin-only audited restoration. The referenced archive is immutable to
 * browser clients and is revalidated before a NEW revision is created.
 * Previous current report is never overwritten without history and audit.
 */
export async function restoreTrustedReport({db,verifiedUid,kind,date,station,
 fromVersion,expectedVersion,reason}={}){
 if(!db||typeof db.doc!=='function'||!text(verifiedUid,128))
  throw new Error('server_auth_required');
 if(!['ofd','inhub'].includes(kind)||!Number.isInteger(fromVersion)||
  fromVersion<1||fromVersion>999999||!Number.isInteger(expectedVersion)||
  expectedVersion<1||expectedVersion>999999||!text(reason,120)||
  reason.length<10)throw new Error('invalid_restore_approval');
 const key=reportKey(date,station);
 const archiveCollection=kind==='ofd'?'performanceVersions':'inventoryVersions';
 const archived=await db.doc(archiveCollection+'/'+archiveId(key,fromVersion)).get();
 if(!archived.exists)throw new Error('restore_archive_not_found');
 const d=archived.data();
 if(d.key!==key||d.version!==fromVersion||
  d.validationSource!=='server-aggregates-only'||
  d.unverifiedLegacy===true||d.kind!==kind)
  throw new Error('restore_archive_untrusted');
 // Never reuse a stored client hash as proof: calculate over all archive data.
 const fields=kind==='ofd'?
  ['key','date','station','rows','totalOFD','totalDelivered','courierCount']:
  ['key','date','station','dates','areas','total'];
 const candidate=Object.fromEntries(fields.map(k=>[k,d[k]]));
 const verified=validateTrustedReport(kind,candidate);
 if(d.contentHash!==verified.contentHash)
  throw new Error('restore_archive_integrity_failed');
 return commitTrustedReport({db,verifiedUid,kind,candidate,
  status:kind==='ofd'?d.status:null,allowReplace:true,expectedVersion,
  sourceName:'RESTORE_v'+fromVersion+'_'+reason,
  requireAdmin:true,restoreFromVersion:fromVersion,restoreReason:reason});
}
