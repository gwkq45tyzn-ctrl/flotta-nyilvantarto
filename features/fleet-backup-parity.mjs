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
import {planSharedMigration} from './shared-master-adapter.mjs';

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


/**
 * Synthetic/offline parity of the ACTUAL canonical /flottaSharedState/current
 * shape written by features/firestore-bridge.js. The bridge appends one
 * deterministic normalizedPlate to each rich vehicle and adds the protected
 * migrationSourceSha256; raw four-array backup parity alone cannot compare
 * this document directly and would reject an otherwise correct projection.
 *
 * The derived field MUST NOT mask a changed original record, history, fuel
 * card, driver, or contact. No cloud reads, restoration, or owner approval.
 */
export function auditProjectedCanonicalFleetRestore(originalBackup,canonicalDocument,options={}){
  const reasons=[];
  const original=extract(originalBackup,{},reasons);
  if(!plain(canonicalDocument)){
    return {
      status:'BLOCKED',reasons:[...new Set([...reasons,'invalid_canonical_document'])],
      sourceBackupObtained:false,restoreToLiveVerified:false,
      serverApprovalVerified:false,ownerAuthorized:false,deployAuthorized:false
    };
  }
  const allowed=[...FLEET_ARRAY_KEYS,'revision','migrationSourceSha256','updatedAt','updatedBy'];
  if(Object.keys(canonicalDocument).some(k=>!allowed.includes(k)))
    reasons.push('unexpected_canonical_document_field');

  const canonicalVehicles=canonicalDocument.vehicles;
  const restoredVehicles=[];
  if(!Array.isArray(canonicalVehicles))reasons.push('missing_or_invalid_vehicles');
  else for(let i=0;i<canonicalVehicles.length;i++){
    const vehicle=canonicalVehicles[i];
    const source=original?.vehicles?.[i];
    if(!plain(vehicle)||!plain(source)){
      reasons.push('invalid_vehicle_projection');continue;
    }
    // Only ASCII characters understood equally by JS and Firestore Rules.
    // Hidden Unicode case folding must never be silently "normalized".
    const raw=source.rendszam;
    const expected=typeof raw==='string'&&/^[A-Za-z0-9 -]{4,40}$/.test(raw)
      ?raw.replace(/[ -]/g,'').toUpperCase():null;
    if(!expected||!/^[A-Z0-9]{4,12}$/.test(expected)){
      reasons.push('invalid_original_plate_for_projection');
    }else if(vehicle.normalizedPlate!==expected){
      reasons.push('derived_plate_mismatch');
    }
    if(!Object.hasOwn(vehicle,'normalizedPlate'))
      reasons.push('missing_derived_plate');
    const clean={...vehicle};
    // Compare every source-owned field, including history and optional rich
    // fields. Remove ONLY the bridge-owned field when it did not exist before.
    if(!Object.hasOwn(source,'normalizedPlate'))delete clean.normalizedPlate;
    restoredVehicles.push(clean);
  }

  const plainRestored={
    vehicles:restoredVehicles,
    fuelCards:canonicalDocument.fuelCards,
    drivers:canonicalDocument.drivers,
    contacts:canonicalDocument.contacts,
    revision:canonicalDocument.revision,
    updatedAt:canonicalDocument.updatedAt,
    updatedBy:canonicalDocument.updatedBy
  };
  const parity=auditOriginalFleetRestore(originalBackup,plainRestored,options);
  const sourceHash=parity.payloadSha256;
  if(!sourceHash||canonicalDocument.migrationSourceSha256!==sourceHash)
    reasons.push('protected_migration_source_sha_mismatch');
  if(original){
    // A perfectly preserved source may still be unusable for Depot booking:
    // duplicates and unknown status remain a separate pre-cutover STOP.
    try{
      const mapping=planSharedMigration(original);
      if(!mapping.ready)reasons.push('unresolved_original_master_mapping');
    }catch(_){reasons.push('invalid_original_master_mapping');}
  }

  let canonicalDocumentSizeEstimate=null;
  try{
    const checked=analyze({
      vehicles:canonicalDocument.vehicles,fuelCards:canonicalDocument.fuelCards,
      drivers:canonicalDocument.drivers,contacts:canonicalDocument.contacts,
      revision:canonicalDocument.revision,
      migrationSourceSha256:canonicalDocument.migrationSourceSha256,
      // Safe placeholders: native Firestore Timestamp/actual UID must still
      // be checked by the privileged importer against the live document size.
      updatedAt:'SYNTHETIC_TIMESTAMP_PLACEHOLDER',
      updatedBy:'SYNTHETIC_UID_PLACEHOLDER'
    });
    canonicalDocumentSizeEstimate=checked.firestoreDocumentBytes;
    if(checked.stop)reasons.push('canonical_document_size_or_schema_stop');
  }catch(_){reasons.push('canonical_document_size_or_schema_stop');}

  const all=[...new Set([...parity.reasons,...reasons])];
  return {
    ...parity,
    status:all.length?'BLOCKED':'PARITY_MATCHED_OFFLINE',
    reasons:all,
    canonicalDocumentSizeEstimate,
    projectedPlateCount:restoredVehicles.length,
    nativeTimestampAndUIDSizeVerified:false,
    notice:'Offline exact source fields plus derived plate and source SHA; not proof of a live backup, Firestore write, restore, Rules publication or owner GO'
  };
}
