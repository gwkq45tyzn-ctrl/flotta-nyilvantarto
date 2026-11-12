/**
 * Local server-side importer checkpoint design.
 * Enforces independent pin + backup, rejects poison, tracks batches,
 * and refuses seal without external IAM proof.
 * NOT a production importer. Synthetic only.
 */
import {createLocalImporter} from './v1-privileged-importer-local.mjs';
import {sha256} from './v1-migration-dryrun.mjs';

export class ServerImporterCheckpoint {
  #importer;
  #checkpoint = null;
  constructor(opts) {
    this.#importer = createLocalImporter(opts);
  }

  async begin(snapshot, backup) {
    const pre = await this.#importer.importSource(snapshot, {backup});
    if (!pre.ok) return {ok: false, reason: pre.reason, sealed: false};
    this.#checkpoint = {
      phase: 'importing',
      sourceSha256: pre.sourceSha256,
      completed: [],
      sealed: false
    };
    return {ok: true, checkpoint: structuredClone(this.#checkpoint), sealed: false};
  }

  async applyBatch(ids) {
    if (!this.#checkpoint || this.#checkpoint.sealed)
      return {ok: false, reason: 'NO_OPEN_CHECKPOINT'};
    this.#checkpoint.completed = [...new Set([...this.#checkpoint.completed, ...ids])];
    return {ok: true, completed: this.#checkpoint.completed.length, sealed: false};
  }

  async seal() {
    if (!this.#checkpoint) return {ok: false, reason: 'NO_CHECKPOINT'};
    // Always refuse real seal in free-tool scope
    return {
      ok: false,
      sealed: false,
      reason: 'SEAL_REFUSED_NO_PRODUCTION_IAM_PROOF',
      authorizedForImport: false,
      checkpoint: structuredClone(this.#checkpoint)
    };
  }

  getCheckpoint() {
    return this.#checkpoint ? structuredClone(this.#checkpoint) : null;
  }
}

export function createServerImporter(opts) {
  return new ServerImporterCheckpoint(opts);
}
