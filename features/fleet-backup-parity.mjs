/**
 * Offline, read-only original Fleet backup/restore parity audit.
 *
 * IMPORTANT: This does NOT export, access, import or migrate real data.
 * It compares the exact four-array result of the ORIGINAL index.html
 * snapshot() to the same four-array state from a proposed restored document.
 * The SHA-256 domain is EXPLICITLY four arrays only, without Firestore revision
 * or updatedAt/By metadata. Requires separate authorized server-side cutover.
 */
import {createHash} from 'node:crypto';
import {analyze,canonical} from './migration-size-probe.mjs';

export const FLEET_ARRAY_KEYS=Object.freeze([
  'vehicles','fuelCards','drivers','contacts'
]);
const RESTORED_METADATA=Object.freeze(['revision','updatedAt','updatedBy']);
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&
  (Object.getPrototypeOf(x)===Object.prototype||Object.getPrototypeOf(x)===null);
const sha=x=>createHash('sha256').update(canonical(x),'utf8').digest('hex');

function extract(input,{restored=false}={},reasons){
  if(!plain(input)){
    reasons.push(restored?'invalid_restored_document':'invalid_original_backup');
    return null;
  }
  const allowed=restored?[...FLEET_ARRAY_KEYS,...RESTORED_METADATA]:FLEET_ARRAY_KEYS;
  if(Object.keys(input).some(k=>!allowed.includes(k)))
    reasons.push(restored?'unexpected_restored_field':'unexpected_original_field');
  const payload={};
  for(const key of FLEET_ARRAY_KEYS){
    if(!Array.isArray(input[key]))reasons.push('missing_or_invalid_'+key);
    else payload[key]=input[key];
  }
  if(restored && (!Number.isSafeInteger(input.revision)||input.revision<1))
    reasons.push('missing_or_invalid_import_revision');
  return Object.keys(payload).length===FLEET_ARRAY_KEYS.length?payload:null;
}

export function auditOriginalFleetRestore(originalBackup,proposedRestoredDocument,options={}){
  const reasons=[];
  const original=extract(originalBackup,{},reasons);
  const restored=extract(proposedRestoredDocument,{restored:true},reasons);
  let sourceSha256=null,restoredSha256=null,estimatedBytes=null;
  let sourceCount=null,restoredCount=null;
  if(original&&restored){
    try{
      sourceSha256=sha(original);
      restoredSha256=sha(restored);
      sourceCount=Object.fromEntries(FLEET_ARRAY_KEYS.map(k=>[k,original[k].length]));
      restoredCount=Object.fromEntries(FLEET_ARRAY_KEYS.map(k=>[k,restored[k].length]));
      if(sourceSha256!==restoredSha256)reasons.push('backup_restore_payload_mismatch');
      if(options.approvedSourceSha256!==undefined &&
         (typeof options.approvedSourceSha256!=='string' ||
         !/^[a-f0-9]{64}$/.test(options.approvedSourceSha256) ||
         options.approvedSourceSha256!==sourceSha256))
        reasons.push('approval_source_hash_mismatch');
      const analysis=analyze({
        ...restored,revision:proposedRestoredDocument.revision
      });
      estimatedBytes=analysis.firestoreDocumentBytes;
      if(analysis.stop)reasons.push('native_document_size_or_schema_stop');
    }catch(error){
      reasons.push('noncanonical_or_invalid_nested_source');
    }
  }
  return {
    status:reasons.length?'BLOCKED':'PARITY_MATCHED_OFFLINE',
    reasons,
    payloadSha256:sourceSha256,
    restoredPayloadSha256:restoredSha256,
    counts:sourceCount,restoredCounts:restoredCount,
    estimatedFirestoreDocumentBytes:estimatedBytes,
    // This is a PARITY CHECK, not a private backup, recovery test or approval.
    sourceBackupObtained:false,
    restoreToLiveVerified:false,
    serverApprovalVerified:false,
    ownerAuthorized:false,
    deployAuthorized:false,
    notice:'Only offline JSON four-array parity; requires private real backup, actual restore drill, SHA approval, and live Rules before GO'
  };
}
