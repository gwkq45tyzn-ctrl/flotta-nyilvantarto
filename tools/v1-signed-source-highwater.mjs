/**
 * Signed source bound to durable registry high-water.
 * Without external privileged isolation, always fail closed.
 * Privileged bypass can still reset state. Synthetic only. Never seals.
 */
export class SignedSourceHighwater {
  constructor({externalPrivilegedIsolationVerified = false} = {}) {
    this.externalPrivilegedIsolationVerified = externalPrivilegedIsolationVerified === true;
  }

  check(sourceSha, registrySequence) {
    if (!this.externalPrivilegedIsolationVerified) {
      return {
        ok: false,
        sealed: false,
        canSeal: false,
        authorizedForImport: false,
        productionIamVerified: false,
        privilegedWriterIsolationVerified: false,
        reason: 'NO_EXTERNAL_PRIVILEGED_ISOLATION'
      };
    }
    // Even with flag, privileged bypass remains possible
    return {
      ok: false,
      sealed: false,
      canSeal: false,
      authorizedForImport: false,
      productionIamVerified: false,
      privilegedWriterIsolationVerified: false,
      reason: 'PRIVILEGED_BYPASS_CAN_RESET_HIGHWATER_NO_SEAL'
    };
  }
}

export function createSignedSourceHighwater(opts) {
  return new SignedSourceHighwater(opts);
}
