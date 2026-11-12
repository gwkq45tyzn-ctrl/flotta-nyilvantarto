/**
 * Local durable checkpoint fencing for the server importer.
 * Prevents parallel imports and forged checkpoint advancement.
 * Seal remains refused without production IAM proof.
 * Synthetic only — not a real durable store.
 */
import {createServerImporter} from './v1-server-importer-checkpoint.mjs';

export class DurableCheckpointFencing {
  #importer;
  #active = null;
  #lock = false;

  constructor(opts = {}) {
    this.#importer = createServerImporter(opts);
  }

  async acquire(snapshot, backup) {
    if (this.#lock) return {ok: false, reason: 'PARALLEL_IMPORT_DENIED'};
    this.#lock = true;
    try {
      const begin = await this.#importer.begin(snapshot, backup);
      if (!begin.ok) {
        this.#lock = false;
        return begin;
      }
      this.#active = {startedAt: Date.now(), checkpoint: begin.checkpoint};
      return {ok: true, checkpoint: begin.checkpoint, sealed: false};
    } catch (e) {
      this.#lock = false;
      return {ok: false, reason: String(e.message || e)};
    }
  }

  async apply(ids) {
    if (!this.#lock || !this.#active) return {ok: false, reason: 'NO_ACTIVE_IMPORT'};
    return this.#importer.applyBatch(ids);
  }

  async release() {
    this.#lock = false;
    this.#active = null;
    return {ok: true, released: true};
  }

  async seal() {
    if (!this.#lock) return {ok: false, reason: 'NO_ACTIVE_IMPORT'};
    const result = await this.#importer.seal();
    // Always refuse real seal
    return {
      ...result,
      sealed: false,
      authorizedForImport: false,
      reason: result.reason || 'SEAL_REFUSED_NO_PRODUCTION_IAM_PROOF'
    };
  }

  isLocked() { return this.#lock; }
}

export function createFencedImporter(opts) {
  return new DurableCheckpointFencing(opts);
}
