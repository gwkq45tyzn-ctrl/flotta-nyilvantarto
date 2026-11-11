/**
 * Local, read-only preflight/attestation adapter for an importer THAT DOES
 * NOT YET EXIST. No privileged SDK, IAM, Firestore connection or write API.
 *
 * Never authorize importing merely because a source hashes to itself.
 * Require a separately pinned SHA, a full-rich pre-import backup and an
 * expected revision supplied as EXTERNAL trusted inputs by a future owner-
 * authorized importer. Even that proves local content integrity, NOT the
 * provenance/authority of the pin or production IAM credentials.
 */
import {sha256} from './v1-migration-dryrun.mjs';
import {verifyPinnedImportSource} from './v1-pinned-backup-trust.mjs';

const DENY_SCOPE='LOCAL_CONTENT_INTEGRITY_ONLY';
const denied=(reason,details)=>({
  ok:false,sealed:false,authorizedForImport:false,
  trustedExternalProvenanceVerified:false,
  productionIamVerified:false,firestoreEncodedSizeVerified:false,
  proofScope:DENY_SCOPE,reason,...(details===undefined?{}:{details})
});
const validHash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);

export class LocalPrivilegedImporter {
  constructor({dryRun=true,trustedPinnedSha=null,expectedRevision=1}={}){
    // There is deliberately no privileged write capability.
    this.dryRun=dryRun===true;
    this.trustedPinnedSha=trustedPinnedSha;
    this.expectedRevision=expectedRevision;
    this.writes=Object.freeze([]);
  }

  /**
   * @param {object} snapshot Raw exact source export (not a signed approval).
   * @param {object} opts The second argument may contain observedKeyed for
   *   a post-batch parity preview. During BEFORE-import preflight omit it.
   *   backup MUST be a distinct pre-import backup carrying the raw snapshot.
   */
  async importSource(snapshot,opts={}){
    if(!opts||typeof opts!=='object'||Array.isArray(opts))
      return denied('INVALID_OPTIONS');
    const pin=opts.trustedPinnedSha??this.trustedPinnedSha;
    const revision=opts.expectedRevision??this.expectedRevision;
    if(!validHash(pin)||!Number.isSafeInteger(revision)||revision<1)
      return denied('INDEPENDENT_PIN_AND_REVISION_REQUIRED');
    if(!opts.backup)return denied('INDEPENDENT_BACKUP_REQUIRED');
    let actualSourceSha;
    try {
      actualSourceSha=sha256(snapshot);
    } catch(error) {
      return denied('INVALID_RAW_SOURCE',String(error.message||error));
    }
    if(actualSourceSha!==pin)return denied('RAW_SOURCE_NOT_TRUSTED_PIN');
    // This separately checks *every* full-rich backup field, sourceIndex,
    // original normalized uniqueness, revision, 4 arrays, source fields,
    // projected keyed document shapes and local size advisory.
    let verdict;
    try {
      verdict=verifyPinnedImportSource({
        backup:opts.backup,trustedPinnedSha:pin,expectedRevision:revision,
        ...(
          Object.prototype.hasOwnProperty.call(opts,'observedKeyed')
          ? {observedKeyed:opts.observedKeyed}: {}
        )
      });
    }catch(error){
      return denied('PREFLIGHT_EXCEPTION',String(error.message||error));
    }
    if(!verdict.ok)return denied(verdict.reason||'ATTESTATION_FAILED',verdict.details);
    // Critical: we never use local "withSecurityRulesDisabled" or self-
    // calculated hash as proof that a production importer is authorized.
    if(!this.dryRun)
      return denied('SEAL_REFUSED_NO_PRODUCTION_IAM_PROOF');
    return {
      ok:true,sealed:false,authorizedForImport:false,
      trustedExternalProvenanceVerified:false,
      productionIamVerified:false,firestoreEncodedSizeVerified:false,
      proofScope:DENY_SCOPE,
      reason:'DRY_RUN_PINNED_SOURCE_PREFLIGHT_ONLY_NO_SEAL',
      sourceSha256:pin,expectedRevision:revision,
      projectedDocumentCount:verdict.projectedDocumentCount,
      keyedParityVerified:Object.prototype.hasOwnProperty.call(opts,'observedKeyed'),
      sourceCounts:verdict.counts,
      advisoryOk:verdict.firestoreAdvisory.advisoryOk,
      writesAttempted:0
    };
  }
}
export function createLocalImporter(opts){return new LocalPrivilegedImporter(opts);}
