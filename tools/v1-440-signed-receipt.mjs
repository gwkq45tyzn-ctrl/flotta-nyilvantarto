/**
 * Bounded signed-source receipt for 440 records.
 * Uses per-chunk digests. Never claims whole-namespace atomicity.
 * Without external privileged isolation, always fail closed. Synthetic only.
 */
export class BoundedSignedReceipt {
  constructor({externalPrivilegedIsolationVerified = false} = {}) {
    this.externalPrivilegedIsolationVerified = externalPrivilegedIsolationVerified === true;
  }

  check(totalPairs, chunkSize = 24) {
    if (totalPairs > 440)
      return {ok: false, reason: 'EXCEEDS_440_LIMIT'};
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
      reason: 'PRIVILEGED_BYPASS_CAN_RESET_RECEIPT_NO_SEAL'
    };
  }
}

export function createBoundedSignedReceipt(opts) {
  return new BoundedSignedReceipt(opts);
}
