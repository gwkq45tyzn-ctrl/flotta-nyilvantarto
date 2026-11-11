/**
 * #184 LOCAL trusted-backup content validation, not a credential, seal or IAM.
 * The digest MUST be pinned outside the source/backup under review by an
 * independent authorized operator; passing a matching attacker supplied
 * digest has no authenticity guarantee. This function cannot write Firestore.
 */
import {preflight,buildPlan,sha256,detectPartial,restoreDrill} from './v1-migration-dryrun.mjs';
import {createMigrationManifest,canonicalStringify} from '../features/migration-manifest.mjs';
import {checkSizeGate} from './v1-firestore-size-gate.mjs';

const hex64=v=>typeof v==='string'&&/^[0-9a-f]{64}$/.test(v);
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
export function verifyPinnedImportSource({
  backup, trustedPinnedSha, expectedRevision, observedKeyed
}={}){
  const deny=(reason,details)=>({
    ok:false,reason,details,
    proofScope:'LOCAL_CONTENT_INTEGRITY_ONLY',
    trustedExternalProvenanceVerified:false,
    authorizedForImport:false,sealed:false
  });
  if(!hex64(trustedPinnedSha)||!Number.isSafeInteger(expectedRevision)||expectedRevision<1)
    return deny('TRUST_PIN_OR_REVISION_MISSING');
  if(!backup||backup.type!=='v1-full-rich-backup'||backup.version!==2)
    return deny('INVALID_BACKUP_ENVELOPE');
  if(backup.imported!==false)return deny('BACKUP_NOT_PREIMPORT');
  if(backup.sourceSha256!==trustedPinnedSha)
    return deny('UNTRUSTED_BACKUP_DIGEST');
  const restored=restoreDrill(backup,trustedPinnedSha);
  if(!restored.ok)return deny('BACKUP_CONTENT_TAMPER',restored.error);
  const source=backup.snapshot;
  const pre=preflight(source);
  if(!pre.ok)return deny('SOURCE_PREFLIGHT_DENIED',pre.errors);
  if(pre.sourceSha256!==trustedPinnedSha||sha256(source)!==trustedPinnedSha)
    return deny('SOURCE_PIN_DRIFT');
  if(own(source,'revision')&&source.revision!==expectedRevision)
    return deny('SOURCE_REVISION_DRIFT');
  if(own(source,'sealed')||own(source,'migrationSourceSha256'))
    return deny('SOURCE_ALREADY_HAS_PRIVILEGED_SEAL_FIELDS');
  if(Object.keys(source).some(k=>k==='sourceIndex'))
    return deny('SOURCE_RESERVED_FIELD');
  // Ensure backup's array counts really correspond to the exact raw source.
  if(Object.entries(pre.counts).some(([k,n])=>backup.counts?.[k]!==n))
    return deny('BACKUP_COUNT_DRIFT');
  let manifest,plan;
  try{
    manifest=createMigrationManifest(source);
    plan=buildPlan(source,pre);
  }catch(e){return deny('CANNOT_CANONICALIZE_SOURCE',String(e));}
  if(manifest.sourceHash!==trustedPinnedSha||!manifest.withinConservativeJsonBudget)
    return deny('MANIFEST_PIN_OR_SIZE_MISMATCH');
  // Cover source rich trees, unknown fields, all original order and claim-free
  // importer-projected keyed identities.
  if(canonicalStringify(plan.fuelCards)!==canonicalStringify(source.fuelCards)||
     canonicalStringify(plan.contacts)!==canonicalStringify(source.contacts))
    return deny('NON_KEYED_RICH_FIELDS_CHANGED');
  const projected={};
  for(const kind of ['drivers','vehicles']){
    for(const item of plan[kind]){
      const path=(kind==='drivers'?'flottaDrivers/':'flottaVehicles/')+item.id;
      if(own(projected,path))return deny('DUPLICATE_PLAN_ID',path);
      projected[path]=item.data;
    }
  }
  const size=checkSizeGate(source,projected);
  if(!size.advisoryOk)return deny('FIRESTORE_ADVISORY_OR_SCHEMA_DENIED',size.reason);
  if(observedKeyed!==undefined){
    const state=detectPartial(plan,observedKeyed);
    if(!state.complete)return deny('KEYED_PARITY_DENIED',state);
  }
  return {
    ok:true,sourceSha256:trustedPinnedSha,expectedRevision,
    counts:pre.counts,manifest,plan,
    projectedDocumentCount:Object.keys(projected).length,
    firestoreAdvisory:size,
    proofScope:'LOCAL_CONTENT_INTEGRITY_ONLY',
    trustedExternalProvenanceVerified:false,
    authorizedForImport:false,sealed:false
  };
}
