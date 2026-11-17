/**
 * Local-only owner capacity PREPARATION. No Drive, Firestore, IAM, network,
 * persistence, seal or migration operation is available here.
 *
 * Missing capacities MUST be explicitly reviewed per active courier. No
 * default 70/80 is inferred from previous bookings, tests or an admin mirror.
 * Output changes the future source digest, requiring a NEW independent owner
 * backup and signature/pin before any authorized importer is contemplated.
 */
import {preflight,sha256} from './v1-migration-dryrun.mjs';
import {assessFleetDepotOperationalReadiness} from './v1-operational-readiness.mjs';

const da=s=>typeof s==='string'&&/^[A-Za-z0-9_-]{4,40}$/.test(s.trim())
  ?s.trim().toUpperCase():null;
const active=s=>typeof s==='string'&&['aktiv','aktív'].includes(s.trim().toLowerCase());
const okCapacity=n=>Number.isSafeInteger(n)&&n>=1&&n<=10000;
const denied=(reason,counts={})=>({
  ok:false,reason,counts,authorizedForImport:false,
  ownerApprovalVerified:false,sourceMustBeIndependentlyRebackedUp:true
});

export function prepareReviewedCourierCapacities(raw,decisions){
  if(raw&&typeof raw==='object'&&!Array.isArray(raw)&&
    (raw.sealed===true||Object.prototype.hasOwnProperty.call(raw,'migrationSourceSha256')))
    return denied('SEALED_OR_ALREADY_MIGRATED_SOURCE_NOT_EDITABLE');
  const source=preflight(raw);
  if(!source.ok)return denied('INVALID_RICH_SOURCE');
  if(!Array.isArray(decisions))return denied('REVIEWED_DECISIONS_ARRAY_REQUIRED');
  const expected=new Map();
  for(let i=0;i<raw.drivers.length;i++){
    const row=raw.drivers[i];
    if(!active(row.status))continue;
    const id=da(row.daCode);
    if(!id||expected.has(id))return denied('NONUNIQUE_ACTIVE_DRIVER');
    expected.set(id,i);
  }
  const reviewed=new Map();
  for(const entry of decisions){
    if(!entry||typeof entry!=='object'||Array.isArray(entry)||
       ![Object.prototype,null].includes(Object.getPrototypeOf(entry))||
       Object.keys(entry).length!==3||
       !['daCode','kapacitas','reviewed'].every(k=>
         Object.prototype.hasOwnProperty.call(entry,k))||
       entry.reviewed!==true||!okCapacity(entry.kapacitas))
      return denied('INVALID_EXPLICIT_REVIEW_ENTRY');
    const id=da(entry.daCode);
    if(!id||!expected.has(id))return denied('UNAPPROVED_OR_INACTIVE_COURIER');
    if(reviewed.has(id))return denied('DUPLICATE_COURIER_REVIEW');
    reviewed.set(id,entry.kapacitas);
  }
  const missing=raw.drivers.filter(row=>
    active(row.status)&&!okCapacity(row.kapacitas)).length;
  for(const [id,index] of expected){
    const row=raw.drivers[index];
    if(!okCapacity(row.kapacitas)&&!reviewed.has(id))
      return denied('MISSING_ACTIVE_COURIER_REVIEW',{activeMissing:missing,reviewed:reviewed.size});
  }
  // Preserve every source field, nested history and array order by strict JSON
  // cloning. Only expressly reviewed capacity properties may change.
  const candidate=JSON.parse(JSON.stringify(raw));
  let changed=0;
  for(const [id,value] of reviewed){
    const row=candidate.drivers[expected.get(id)];
    if(row.kapacitas!==value){row.kapacitas=value;changed++;}
  }
  const post=preflight(candidate);
  if(!post.ok)return denied('REVIEWED_SOURCE_PREFLIGHT_FAILED');
  const operational=assessFleetDepotOperationalReadiness(candidate);
  // Capacity-only preview can preserve unknown statuses, but MUST report
  // operationally blocked. It is not an owner status decision.
  if(operational.reasons.some(r=>r!=='DRIVER_STATUS_NEEDS_OWNER_REVIEW'))
    return denied('OPERATIONAL_READINESS_STILL_BLOCKED',operational.counts);
  return {
    ok:true,
    operationallyReady:operational.ready,
    statusReviewRequired:operational.counts.uncertainDriverStatuses>0,
    // Contains PRIVATE full rich data: never write to GitHub or log to CI.
    candidate,
    counts:{activeReviewed:reviewed.size,changed,activeMissingBefore:missing},
    previousSourceSha256:source.sourceSha256,
    candidateSourceSha256:sha256(candidate),
    sourceMustBeIndependentlyRebackedUp:true,
    authorizedForImport:false,
    ownerApprovalVerified:false,
    firestoreEncodedSizeVerified:false,
    productionIamVerified:false,
    previewOnly:true
  };
}


/** Private review plan bound to the COMPLETE original source digest.
 * All uncertain statuses and ALL resulting active capacities need explicit
 * individual decisions. This proves content/CAS, never reviewer identity.
 */
export function prepareReviewedCourierOperations(raw,review){
  try{
    if(!review||typeof review!=='object'||Array.isArray(review)||
       Object.keys(review).sort().join(',')!=='capacities,sourceSha256,statuses'||
       typeof review.sourceSha256!=='string'||
       !/^[a-f0-9]{64}$/.test(review.sourceSha256)||
       review.sourceSha256!==sha256(raw))
      return denied('REVIEW_SOURCE_CHANGED_OR_PLAN_INVALID');
    if(raw?.sealed===true||Object.hasOwn(raw,'migrationSourceSha256')||!preflight(raw).ok)
      return denied('INVALID_OR_MIGRATED_REVIEW_SOURCE');
    const known=s=>typeof s==='string'&&['aktiv','aktív','inaktiv','inaktív'].includes(s.trim().toLowerCase());
    const unknown=raw.drivers.filter(d=>!known(d.status));
    if(!Array.isArray(review.statuses)||review.statuses.length!==unknown.length)
      return denied('ALL_UNCERTAIN_STATUSES_REQUIRE_REVIEW');
    const byId=new Map(unknown.map(d=>[d.id,d])),seen=new Set();
    const candidate=JSON.parse(JSON.stringify(raw));
    for(const d of review.statuses){
      if(!d||typeof d!=='object'||Array.isArray(d)||
         Object.keys(d).sort().join(',')!=='daCode,id,reviewed,status'||
         d.reviewed!==true||!['aktiv','inaktiv'].includes(d.status)||
         !byId.has(d.id)||seen.has(d.id)||da(d.daCode)!==da(byId.get(d.id).daCode))
        return denied('INVALID_EXPLICIT_STATUS_REVIEW');
      seen.add(d.id);
      candidate.drivers.find(row=>row.id===d.id).status=d.status;
    }
    const ids=new Set(candidate.drivers.filter(d=>active(d.status)).map(d=>da(d.daCode)));
    if(!Array.isArray(review.capacities)||review.capacities.length!==ids.size||
       new Set(review.capacities.map(d=>da(d?.daCode))).size!==ids.size||
       review.capacities.some(d=>!ids.has(da(d?.daCode))))
      return denied('ALL_RESULTING_ACTIVE_CAPACITIES_REQUIRE_REVIEW');
    const prepared=prepareReviewedCourierCapacities(candidate,review.capacities);
    if(!prepared.ok||!prepared.operationallyReady)
      return denied('REVIEWED_OPERATIONS_STILL_BLOCKED');
    return {...prepared,previousSourceSha256:review.sourceSha256,
      statusDecisionsReviewed:seen.size,reviewedDecisionsAuthenticated:false};
  }catch{return denied('PRIVATE_OPERATIONS_REVIEW_INVALID');}
}
