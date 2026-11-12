/**
 * LOCAL independently PINNED source CONTENT verification contract only.
 *
 * It is NOT a source-signature verifier, production identity provider, IAM
 * authority, deployment, import writer or seal. A caller can construct its
 * own instance with a self-chosen pin, so externalPin's AUTHENTICITY MUST
 * be established out-of-band by a future externally approved trusted owner.
 * Never promote matching a caller-provided pin to authorization.
 *
 * Strict full-rich backup/normalized identity/sourceIndex preflight is
 * necessary but not sufficient for production provenance.
 */
import {sha256} from './v1-migration-dryrun.mjs';
import {verifyPinnedImportSource} from './v1-pinned-backup-trust.mjs';

const SCOPE='LOCAL_PINNED_CONTENT_INTEGRITY_NOT_AUTHENTICATED_PROVENANCE';
const decision=(ok,reason,fields={})=>({
  ok,reason,sealed:false,authorizedForImport:false,
  productionIamVerified:false,ownerApprovalAuthenticated:false,
  provenanceSignerVerified:false,externalPinAuthenticityVerified:false,
  verifiedSourceAuthority:false,proofScope:SCOPE,...fields
});
const isOwn=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const isPlain=o=>o!==null&&typeof o==='object'&&!Array.isArray(o)
  &&(Object.getPrototypeOf(o)===Object.prototype||
     Object.getPrototypeOf(o)===null);

export class AuthenticatedSourceContract {
  #pin;
  #revision;
  constructor({externalPin,externalRevision=1}={}){
    if(typeof externalPin!=='string'||!/^[a-f0-9]{64}$/.test(externalPin))
      throw Error('INDEPENDENT_SOURCE_PIN_REQUIRED');
    if(!Number.isSafeInteger(externalRevision)||externalRevision<1)
      throw Error('VALID_PINNED_REVISION_REQUIRED');
    this.#pin=externalPin;this.#revision=externalRevision;
  }
  // Caller may submit its raw source and independently verified full-rich
  // backup, NEVER claim pin/revision/approval/IAM or override auth fields.
  verify(snapshot,options={}){
    if(!isPlain(options))return decision(false,'INVALID_OPTIONS');
    if(Object.keys(options).some(k=>k!=='backup'))
      return decision(false,'UNTRUSTED_CALLER_SUPPLIED_AUTHORITY');
    if(!isOwn(options,'backup'))
      return decision(false,'INDEPENDENT_FULL_RICH_BACKUP_REQUIRED');
    try {
      const sourceSha256=sha256(snapshot);
      if(sourceSha256!==this.#pin)
        return decision(false,'SOURCE_SHA_MISMATCH_PIN');
      const proof=verifyPinnedImportSource({
        backup:options.backup,trustedPinnedSha:this.#pin,
        expectedRevision:this.#revision
      });
      if(!proof.ok)return decision(false,'FULL_RICH_SOURCE_PREFLIGHT_DENIED: '+proof.reason);
      return decision(true,'FULL_RICH_CONTENT_MATCH_ONLY_NO_AUTHORITY',{
        sourceSha256:this.#pin,expectedRevision:this.#revision,
        projectedDocumentCount:proof.projectedDocumentCount,
        sourceCounts:proof.counts
      });
    }catch(e){return decision(false,'INVALID_SOURCE_OR_BACKUP: '+String(e.message||e))}
  }
}
export function createAuthenticatedSourceContract(opts){
  return new AuthenticatedSourceContract(opts);
}
