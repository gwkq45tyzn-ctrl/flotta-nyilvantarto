/**
 * Durable registry antirollback design.
 * A new process must not be able to restore an old signed registry.
 * Without external durable high-water, always fail closed. Synthetic only.
 * Never claims production IAM or seal.
 */
export class DurableRegistryAntirollback {
  #externalHighWater;
  constructor({externalHighWater = null} = {}) {
    this.#externalHighWater = externalHighWater;
  }

  check(registrySequence) {
    if (this.#externalHighWater === null || this.#externalHighWater === undefined)
      return {
        ok: false,
        sealed: false,
        canSeal: false,
        authorizedForImport: false,
        productionIamVerified: false,
        reason: 'NO_EXTERNAL_DURABLE_HIGH_WATER'
      };
    if (!Number.isSafeInteger(registrySequence) || registrySequence < this.#externalHighWater)
      return {
        ok: false,
        sealed: false,
        canSeal: false,
        authorizedForImport: false,
        reason: 'STALE_REGISTRY_SEQUENCE_REJECTED'
      };
    return {
      ok: true,
      sealed: false,
      canSeal: false,
      authorizedForImport: false,
      productionIamVerified: false,
      externalTrustRootAuthenticityVerified: false,
      reason: 'SEQUENCE_AT_OR_ABOVE_HIGH_WATER_NO_SEAL'
    };
  }
}

export function createDurableRegistryAntirollback(opts) {
  return new DurableRegistryAntirollback(opts);
}
