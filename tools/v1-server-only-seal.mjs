/**
 * Server-only seal enforcement design.
 * Untrusted client or out-of-band privileged writer cannot publish sealed:true
 * without separately authorized signer + source provenance and isolated write set.
 * Four collection scans are never treated as atomic. Seal always refused in free-tool scope.
 * Synthetic only.
 */
export class ServerOnlySeal {
  constructor({externalSignerAuthenticated = false, privilegedImporterVerified = false} = {}) {
    this.externalSignerAuthenticated = externalSignerAuthenticated === true;
    this.privilegedImporterVerified = privilegedImporterVerified === true;
  }

  attemptSeal(inventory) {
    if (!this.externalSignerAuthenticated || !this.privilegedImporterVerified) {
      return {
        ok: false,
        sealed: false,
        canSeal: false,
        authorizedForImport: false,
        productionIamVerified: false,
        atomicNamespaceSnapshotVerified: false,
        reason: 'NO_EXTERNAL_SIGNER_OR_PRIVILEGED_IMPORTER'
      };
    }
    // Even with flags, four scans are not an atomic namespace freeze
    return {
      ok: false,
      sealed: false,
      canSeal: false,
      authorizedForImport: false,
      productionIamVerified: false,
      atomicNamespaceSnapshotVerified: false,
      reason: 'FOUR_COLLECTION_SCANS_ARE_NOT_ATOMIC_NO_SEAL'
    };
  }
}

export function createServerOnlySeal(opts) {
  return new ServerOnlySeal(opts);
}
