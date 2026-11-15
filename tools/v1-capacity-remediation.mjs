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
  if(!operational.ready)
    return denied('OPERATIONAL_READINESS_STILL_BLOCKED',operational.counts);
  return {
    ok:true,
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
