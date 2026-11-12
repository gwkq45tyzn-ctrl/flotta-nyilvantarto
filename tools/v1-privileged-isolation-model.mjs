/**
 * Local model for privileged writer isolation.
 * Without external IAM isolation, privileged bypass can still reset highwater or seed poisoned source.
 * Always fails closed. Never seals. Synthetic only.
 */
export class PrivilegedIsolationModel {
  constructor({externalIamIsolationVerified = false} = {}) {
    this.externalIamIsolationVerified = externalIamIsolationVerified === true;
  }

  check(sourceSha) {
    if (!this.externalIamIsolationVerified) {
      return {
        ok: false,
        sealed: false,
        canSeal: false,
        authorizedForImport: false,
        productionIamVerified: false,
        privilegedWriterIsolationVerified: false,
        reason: 'NO_EXTERNAL_IAM_ISOLATION'
      };
    }
    // Even with flag, Admin SDK can still bypass
    return {
      ok: false,
      sealed: false,
      canSeal: false,
      authorizedForImport: false,
      productionIamVerified: false,
      privilegedWriterIsolationVerified: false,
      reason: 'ADMIN_SDK_BYPASS_REMAINS_POSSIBLE_NO_SEAL'
    };
  }
}

export function createPrivilegedIsolationModel(opts) {
  return new PrivilegedIsolationModel(opts);
}
