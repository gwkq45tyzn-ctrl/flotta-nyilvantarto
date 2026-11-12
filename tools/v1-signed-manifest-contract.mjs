/**
 * Independently signed/pinned manifest interface.
 * Requires a separate owner trust root. Never invents a production key.
 * If no trusted external signature is provided, always DENY.
 * Synthetic only.
 */
import {sha256} from './v1-migration-dryrun.mjs';

export class SignedManifestContract {
  #trustRoot;
  constructor({trustRoot = null} = {}) {
    this.#trustRoot = trustRoot;
  }

  verify(snapshot, manifest) {
    if (!this.#trustRoot || typeof this.#trustRoot !== 'string')
      return {ok: false, reason: 'NO_EXTERNAL_TRUST_ROOT', sealed: false, authorizedForImport: false};
    if (!manifest || typeof manifest.signature !== 'string' || !manifest.pin)
      return {ok: false, reason: 'MISSING_EXTERNAL_SIGNATURE_OR_PIN', sealed: false, authorizedForImport: false};
    if (manifest.signature !== this.#trustRoot)
      return {ok: false, reason: 'SIGNATURE_MISMATCH_EXTERNAL_ROOT', sealed: false, authorizedForImport: false};
    const actual = sha256(snapshot);
    if (actual !== manifest.pin)
      return {ok: false, reason: 'PIN_MISMATCH', sealed: false, authorizedForImport: false};
    return {
      ok: true,
      sealed: false,
      authorizedForImport: false,
      productionIamVerified: false,
      provenanceSignerVerified: false,
      reason: 'EXTERNAL_SIGNATURE_MATCH_NO_SEAL'
    };
  }
}

export function createSignedManifestContract(opts) {
  return new SignedManifestContract(opts);
}
