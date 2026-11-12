/**
 * Production-authenticated importer CONTRACT (not deployment).
 * An untrusted caller cannot supply its own source SHA, IAM principal,
 * or manual approval flag. External pin and out-of-band proof required.
 * All production flags remain false. Synthetic only.
 */
import {sha256} from './v1-migration-dryrun.mjs';

export class AuthenticatedSourceContract {
  #externalPin;
  #externalRevision;
  constructor({externalPin, externalRevision = 1} = {}) {
    if (typeof externalPin !== 'string' || !/^[a-f0-9]{64}$/.test(externalPin))
      throw Error('EXTERNAL_PIN_REQUIRED');
    this.#externalPin = externalPin;
    this.#externalRevision = externalRevision;
  }

  verify(snapshot, claimedPin, claimedRevision, claimedApproval) {
    if (claimedPin !== undefined || claimedRevision !== undefined || claimedApproval !== undefined)
      return {ok: false, reason: 'UNTRUSTED_CALLER_SUPPLIED_AUTHORITY'};
    const actual = sha256(snapshot);
    if (actual !== this.#externalPin)
      return {ok: false, reason: 'SOURCE_SHA_MISMATCH_EXTERNAL_PIN'};
    if (this.#externalRevision < 1)
      return {ok: false, reason: 'INVALID_EXTERNAL_REVISION'};
    return {
      ok: true,
      sealed: false,
      authorizedForImport: false,
      productionIamVerified: false,
      ownerApprovalAuthenticated: false,
      provenanceSignerVerified: false,
      sourceSha256: this.#externalPin,
      reason: 'EXTERNAL_PIN_MATCH_ONLY_NO_SEAL'
    };
  }
}

export function createAuthenticatedSourceContract(opts) {
  return new AuthenticatedSourceContract(opts);
}
