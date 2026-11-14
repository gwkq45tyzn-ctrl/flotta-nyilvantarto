/**
 * V1 offline-only Fleet source-readiness assessment and explicit remediation.
 *
 * This module NEVER writes to Firestore, Sheets, Apps Script or a live Fleet.
 * It never supplies a capacity default, infers ACTIVE from unknown status,
 * or authenticates an owner. A separate trusted signed importer and the
 * #83 S1-S12 gate are still necessary before any production operation.
 */
import {sha256} from '../tools/v1-migration-dryrun.mjs';
import {planSharedMigration} from './shared-master-adapter.mjs';

const BLOCKS=['drivers','vehicles','fuelCards','contacts'];
const ALLOWED_STATUS=new Set(['aktiv','aktív','inaktiv','inaktív']);
const SAFE_INACTIVE=new Set(['inaktiv','inaktív']);
const isObject=o=>o!==null&&typeof o==='object'&&!Array.isArray(o);
const has=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const daOf=v=>typeof v==='string'?v.trim().toUpperCase():'';
const missingCapacity=d=>{
  const v=d.kapacitas??d.capacity;
  return v===undefined||v===null||(typeof v==='string'&&!v.trim());
};
const validStatus=d=>ALLOWED_STATUS.has(String(d.status??'').trim().toLowerCase());
const sourceShape=source=>isObject(source) &&
  BLOCKS.every(k=>Array.isArray(source[k]));

export function auditFleetSourceForImport(source){
  if(!sourceShape(source))throw Error('INCOMPLETE_FOUR_BLOCK_SOURCE');
  const originalSha256=sha256(source);
  const missingCapacityIndices=[];
  const unknownStatusIndices=[];
  for(const [index,d] of source.drivers.entries()){
    if(!isObject(d))throw Error('INVALID_DRIVER_ROW');
    if(missingCapacity(d))missingCapacityIndices.push(index);
    if(!validStatus(d))unknownStatusIndices.push(index);
  }
  let issues=[];
  try{
    issues=planSharedMigration(source).issues;
  }catch(e){issues=[{reason:'SOURCE_NOT_PROJECTABLE',message:String(e.message||e)}];}
  return {
    originalSha256,
    counts:Object.fromEntries(BLOCKS.map(k=>[k,source[k].length])),
    missingCapacityIndices,unknownStatusIndices,
    issues,ready:issues.length===0,
    authorizedForImport:false,ownerApprovalAuthenticated:false,
    sourceOfTruthVerified:false,productionIamVerified:false
  };
}

/**
 * Materialize a separate candidate only from exact, index-scoped instructions.
 * Each patch must bind to the original DA identity and original source SHA.
 * Unknown driver statuses can ONLY be made inactive, never auto-activated.
 * Previously defined capacities and valid statuses are immutable here.
 *
 * This function does NOT itself authorize migration or owner approval.
 */
export function buildExplicitFleetRemediationCandidate({
  original,expectedOriginalSha256,changes
}={}){
  if(!sourceShape(original))throw Error('INCOMPLETE_FOUR_BLOCK_SOURCE');
  if(typeof expectedOriginalSha256!=='string'||
     !/^[a-f0-9]{64}$/.test(expectedOriginalSha256)||
     sha256(original)!==expectedOriginalSha256)
    throw Error('ORIGINAL_SOURCE_SHA_MISMATCH');
  if(!Array.isArray(changes)||changes.length===0)
    throw Error('EXPLICIT_DRIVER_PATCHES_REQUIRED');
  const candidate=structuredClone(original);
  const used=new Set(),applied=[];
  for(const patch of changes){
    if(!isObject(patch)||
       Object.keys(patch).some(k=>!['index','expectedDaCode','capacity','status'].includes(k))||
       !Number.isSafeInteger(patch.index)||
       patch.index<0||patch.index>=candidate.drivers.length||
       !/^[A-Z0-9_-]{4,40}$/.test(patch.expectedDaCode||'')||
       (!has(patch,'capacity')&&!has(patch,'status')))
      throw Error('INVALID_EXPLICIT_DRIVER_PATCH');
    if(used.has(patch.index))throw Error('DUPLICATE_DRIVER_PATCH');
    used.add(patch.index);
    const driver=candidate.drivers[patch.index];
    if(!isObject(driver)||daOf(driver.daCode)!==patch.expectedDaCode)
      throw Error('DRIVER_IDENTITY_OR_INDEX_MISMATCH');
    if(has(patch,'capacity')){
      if(!missingCapacity(driver))throw Error('EXISTING_CAPACITY_IMMUTABLE');
      if(!Number.isSafeInteger(patch.capacity)||patch.capacity<0||patch.capacity>10000)
        throw Error('INVALID_EXPLICIT_CAPACITY');
      driver.kapacitas=patch.capacity;
    }
    if(has(patch,'status')){
      if(validStatus(driver))throw Error('VERIFIED_STATUS_IMMUTABLE');
      if(!SAFE_INACTIVE.has(patch.status))
        throw Error('UNVERIFIED_DRIVER_MUST_REMAIN_INACTIVE');
      driver.status=patch.status;
    }
    applied.push({index:patch.index,expectedDaCode:patch.expectedDaCode,
      capacitySet:has(patch,'capacity'),statusSet:has(patch,'status')});
  }
  const check=auditFleetSourceForImport(candidate);
  if(!check.ready)throw Error('CANDIDATE_NOT_IMPORT_READY: '+
    check.issues.map(i=>i.reason).join(','));
  return {
    candidate,originalSha256:expectedOriginalSha256,
    candidateSha256:sha256(candidate),applied,
    ownerApprovalAuthenticated:false,authorizedForImport:false,
    productionSealAllowed:false,immutableOriginalPreserved:true,
    note:'OFFLINE CANDIDATE ONLY – requires owner-approved source and separate trusted import'
  };
}
