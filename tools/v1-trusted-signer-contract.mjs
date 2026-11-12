/**
 * Trusted signer/root external registration contract.
 * Caller cannot select the root. Without an out-of-band owner registry entry,
 * always NO-AUTHORITY and no seal. Synthetic only. Never invents a production key.
 */
export class TrustedSignerContract {
  #externalRegistryEntry;
  constructor({externalRegistryEntry = null} = {}) {
    this.#externalRegistryEntry = externalRegistryEntry;
  }

  verify(candidateManifest) {
    if (!this.#externalRegistryEntry)
      return {
        ok: false,
        sealed: false,
        canSeal: false,
        authorizedForImport: false,
        productionIamVerified: false,
        externalTrustRootAuthenticityVerified: false,
        reason: 'NO_EXTERNAL_OWNER_REGISTRY_ENTRY'
      };
    if (!candidateManifest || candidateManifest.signerId !== this.#externalRegistryEntry.signerId)
      return {
        ok: false,
        sealed: false,
        canSeal: false,
        authorizedForImport: false,
        reason: 'SIGNER_ID_MISMATCH_EXTERNAL_REGISTRY'
      };
    return {
      ok: true,
      sealed: false,
      canSeal: false,
      authorizedForImport: false,
      productionIamVerified: false,
      externalTrustRootAuthenticityVerified: false,
      reason: 'EXTERNAL_REGISTRY_MATCH_NO_SEAL'
    };
  }
}

export function createTrustedSignerContract(opts) {
  return new TrustedSignerContract(opts);
}
