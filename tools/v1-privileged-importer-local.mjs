/**
 * Local-only privileged importer adapter.
 * Enforces attestation BEFORE any writes. Rejects poisoned / duplicate sources.
 * NOT a production IAM proof. Synthetic emulator use only.
 */
import {attestBeforeSeal, refusePoisonedSeal} from './v1-trusted-importer-attestation.mjs';
import {sha256} from './v1-migration-dryrun.mjs';

export class LocalPrivilegedImporter {
  constructor({dryRun = true} = {}) {
    this.dryRun = dryRun;
    this.writes = [];
  }

  async importSource(snapshot, keyedState = {}) {
    const claimed = sha256(snapshot);
    const attestation = attestBeforeSeal(snapshot, keyedState, claimed);
    if (!attestation.ok) {
      return {
        ok: false,
        sealed: false,
        reason: attestation.reason || 'ATTESTATION_FAILED',
        errors: attestation.errors || [],
        authorizedForImport: false,
        proofScope: 'LOCAL_PRIVILEGED_ADAPTER_ONLY'
      };
    }
    // Even after local attestation, refuse seal without external privilege proof
    const refuse = refusePoisonedSeal(snapshot);
    if (this.dryRun) {
      return {
        ok: true,
        sealed: false,
        reason: 'DRY_RUN_ATTESTATION_PASSED_BUT_NO_SEAL',
        sourceSha256: attestation.sourceSha256,
        authorizedForImport: false,
        proofScope: 'LOCAL_PRIVILEGED_ADAPTER_ONLY',
        note: refuse.reason
      };
    }
    // Non-dry-run path still refuses real seal in this free-tool scope
    return {
      ok: false,
      sealed: false,
      reason: 'SEAL_REFUSED_NO_PRODUCTION_IAM_PROOF',
      authorizedForImport: false,
      proofScope: 'LOCAL_PRIVILEGED_ADAPTER_ONLY'
    };
  }
}

export function createLocalImporter(opts) {
  return new LocalPrivilegedImporter(opts);
}
