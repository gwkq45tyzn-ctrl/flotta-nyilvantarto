/**
 * External trust-root bootstrap contract.
 * Caller cannot swap the pinned public key or inject a self-signed root.
 * Revocation and expiry are checked. No production key is invented.
 * Synthetic only.
 */
export class TrustRootBootstrap {
  #pinnedPublicKey;
  #expiry;
  #revoked;
  constructor({pinnedPublicKey = null, expiry = null, revoked = false} = {}) {
    this.#pinnedPublicKey = pinnedPublicKey;
    this.#expiry = expiry;
    this.#revoked = revoked === true;
  }

  verify(candidateKey, now = Date.now()) {
    if (!this.#pinnedPublicKey)
      return {ok: false, reason: 'NO_PINNED_EXTERNAL_PUBLIC_KEY'};
    if (candidateKey !== this.#pinnedPublicKey)
      return {ok: false, reason: 'CALLER_SUPPLIED_KEY_MISMATCH'};
    if (this.#revoked)
      return {ok: false, reason: 'KEY_REVOKED'};
    if (this.#expiry && now > this.#expiry)
      return {ok: false, reason: 'KEY_EXPIRED'};
    return {
      ok: true,
      sealed: false,
      authorizedForImport: false,
      productionIamVerified: false,
      externalTrustRootAuthenticityVerified: false,
      reason: 'PINNED_KEY_MATCH_NO_SEAL'
    };
  }
}

export function createTrustRootBootstrap(opts) {
  return new TrustRootBootstrap(opts);
}
