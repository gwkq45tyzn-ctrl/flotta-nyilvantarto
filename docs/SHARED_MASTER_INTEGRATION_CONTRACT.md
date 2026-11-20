# Canonical Flotta → Depó integration contract (synthetic only)

This patch fixes the mismatched mapping found in the original Flotta vs Depó strict Firestore Rules. No cloud writes are performed.

- Original Flotta driver uses `id` as its **local generated ID**, `daCode` as business code, `name` as name, `agency` as vendor, and `status=aktiv/inaktiv/ismeretlen`. Never invent a DA code from local `id`, never infer active from unknown.
- Original Flotta vehicle uses `rendszam`, `gyartmany`, `modell`, `status=aktiv/szerviz`. Avoid marking unknown vehicles available.
- Firestore `/drivers` and `/vehicles` Rules only admit exact canonical fields. The rich `flotta` sidecar must **never** be written to these collections; use `planSharedMigration(snapshot).writes` projections. Full data stays in original snapshot and migration plan; source history/fuelCards/contacts never silently discarded.
- Incomplete records, invalid DA codes, duplicate normalized IDs or unknown statuses produce `issues`, with `ready=false`. Nothing should be written while ready is false.
- A read-only projection is not yet an integrated synchronizer. Do not replace original Flotta data using a reduced Depó document. Do not initiate live imports without separate authorization, source-version reconciliation, Rules emulator and backup/rollback.

Verify: `node features/shared-master-adapter.test.mjs` on this branch. No browser, emulator or live Firebase test is claimed.
