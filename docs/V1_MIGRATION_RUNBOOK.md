# V1 offline migration/backup/restore drill — QA candidate

**NO-GO: SYNTHETIC / LOCAL ONLY.** No Firebase or Apps Script writes, no privileged authentication, approval, seal, deployment or live import. The exported `sealed:true` in a plan denotes a **proposed target** only and is never applied.

## Offline commands

```bash
node tools/v1-migration-dryrun.mjs preflight --input=synthetic-full-snapshot.json
node tools/v1-migration-dryrun.mjs dry-run --input=synthetic-full-snapshot.json --output=synthetic-plan.json
node tools/v1-migration-dryrun.mjs backup --input=synthetic-full-snapshot.json --output=synthetic-backup.json
node tools/v1-migration-dryrun.mjs restore-drill --backup=synthetic-backup.json --expected-sha=TRUSTED_64_CHAR_SOURCE_HASH
node --test tools/v1-migration-dryrun.test.mjs tools/v1-migration-acceptance.test.mjs
```

The CLI prints only readiness/count/hash summaries, not full names, contacts or plan records. With `--output` it writes a local-only `0600` file, refusing to overwrite an existing file; keep exports out of source control. Invalid input, SHA mismatch, unexpected flags, missing file, invalid restored data and duplicate identities return nonzero. No exports are sent to GitHub/Firebase.

## Preconditions and data invariants

1. Preserve **all four original arrays** and all root-level future/unknown fields in full backup; preserve rich driver/car histories, contacts and fuel-card history recursively.
2. Use SHA-256 over recursively sorted-key canonical JSON, including **all** source fields; recompute on restore and require an externally trusted expected hash. A header alone can never authenticate a tampered backup.
3. Require unique normalized DA and plate plus unique stable internal IDs, valid JSON fields, and raw Fleet `daCode` / `rendszam` preserved verbatim in keyed documents; normalized names only serve as document keys.
4. Enforce an **800-KiB UTF-8 conservative JSON budget**; a pass does NOT prove Firestore's encoded 1-MiB document size. A separate actual Firestore-encoded-size check remains mandatory before migration.
5. A migration is **not complete** merely because the document paths exist. The dry-run comparison requires separate driver and vehicle namespaces, every document and field hash, no missing/extra identities. Empty/pending/cached/server-unconfirmed sources must never be sealed.
6. Plan records are deterministic, include a suggested initial revision, and explicitly say `authorizedForImport:false`, `requiresPrivilegedImporter:true`. The browser cannot create approval or seal.

## Still required outside this tool (release blockers)

- Independent authenticated local Firestore Emulator privileged import rehearsal: source digest attestation and immutable approval, bounded/idempotent writes, checkpoint/resume, interruption recovery and atomic final seal **only after complete server readback**. Current CLI is an **offline simulator**, not an executor.
- Backup+restore drill against a reconstructed target dataset, plus a transaction-safe rollback manifest for interrupted imports; failed or partially sealed sources must fail closed, and a successful sealed source must not be silently unsealed or overwritten.
- Identify the exact existing Google Apps Script deployment ID, endpoints, writers and triggers **privately**, with redacted evidence. During a separately owner-approved cutover, disable each previous write path, verify stale clients are blocked, and preserve a read-only backup. No endpoint has been disabled here.
- Verify the trusted source revision with all pending local saves resolved, check Firestore encoded byte size, obtain separate Grok GO + ChatGPT GO on one final exact SHA, then obtain explicit owner authorization.
- No Cloud Functions, Blaze, paid services, real UID/IAM changes, main merge or production deploy.

## Status

This offline QA strengthens the original Grok #155 proof-of-concept against tampered history, forged hash headers, invalid identifiers, Unicode byte size, partial/inaccurate keyed results and CLI errors. **This is not proof of real authenticated migration, not a release authorization.**