/**
 * Atomic pre-seal inventory and fencing design.
 * Four ordinary collection queries are NEVER treated as atomic.
 * Seal remains refused without a trusted privileged importer and external trust root.
 * Synthetic only.
 */
export class AtomicPresealInventory {
  constructor({trustRootAuthenticated = false} = {}) {
    this.trustRootAuthenticated = trustRootAuthenticated === true;
  }

  check(observed, expectedCount) {
    if (!this.trustRootAuthenticated) {
      return {
        ok: false,
        canSeal: false,
        authorizedForImport: false,
        atomicNamespaceSnapshotVerified: false,
        reason: 'NO_EXTERNAL_TRUST_ROOT_OR_PRIVILEGED_IMPORTER'
      };
    }
    // Even with a flag, four scans are not atomic
    return {
      ok: false,
      canSeal: false,
      authorizedForImport: false,
      atomicNamespaceSnapshotVerified: false,
      reason: 'FOUR_COLLECTION_SCANS_ARE_NOT_ATOMIC'
    };
  }
}

export function createAtomicPresealInventory(opts) {
  return new AtomicPresealInventory(opts);
}
