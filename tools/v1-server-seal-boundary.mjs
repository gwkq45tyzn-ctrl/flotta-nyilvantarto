/**
 * Server-enforced cutover boundary design.
 * Four ordinary collection queries NEVER authorize seal.
 * Seal remains refused without a trusted privileged importer and external trust root.
 * Synthetic only. Never claims production IAM.
 */
export class ServerSealBoundary {
  constructor({externalTrustRootAuthenticated = false, privilegedImporterVerified = false} = {}) {
    this.externalTrustRootAuthenticated = externalTrustRootAuthenticated === true;
    this.privilegedImporterVerified = privilegedImporterVerified === true;
  }

  attemptSeal(inventory) {
    if (!this.externalTrustRootAuthenticated || !this.privilegedImporterVerified) {
      return {
        ok: false,
        canSeal: false,
        authorizedForImport: false,
        atomicNamespaceSnapshotVerified: false,
        productionIamVerified: false,
        reason: 'NO_EXTERNAL_TRUST_ROOT_OR_PRIVILEGED_IMPORTER'
      };
    }
    // Even with flags, four scans are not atomic
    return {
      ok: false,
      canSeal: false,
      authorizedForImport: false,
      atomicNamespaceSnapshotVerified: false,
      productionIamVerified: false,
      reason: 'FOUR_COLLECTION_SCANS_ARE_NOT_ATOMIC_NO_SEAL'
    };
  }
}

export function createServerSealBoundary(opts) {
  return new ServerSealBoundary(opts);
}
