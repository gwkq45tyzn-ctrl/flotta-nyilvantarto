# Apps Script → Firebase V1: cutover and fail-closed recovery playbook
**Status: PLAN / QA ONLY — NO-GO.** No IAM, Apps Script, Firebase, data, or production change is authorized by this document.

## Safety correction: do NOT follow the former destructive rollback recipe
The previous draft said "re-enable Apps Script", "restore localStorage", and "clear Firestore" when an old backup SHA matched. **This is unsafe.** A pre-cutover SHA cannot prove that no new data was committed after cutover. Restoring only an old localStorage copy or deleting `flottaSharedState/current` could erase valid edits and expose old clients to a split-brain database. **Never delete or overwrite live Firestore during routine rollback.**

## Preconditions — all independently evidenced, not assumed
1. Explicit owner authorization of a frozen commit and the exact target project, separately from any CI result. A GO from Grok and a separate GO from ChatGPT are also required.
2. Privately inventory **every** old Apps Script deployment, writer entry point, clients/browser tabs, localStorage copies, web-app permission and scheduling path. The code-level `gateOldSync()` protects only participating new clients; it does **not** revoke old deployments, cached clients, or other accounts.
3. Name the human incident owner, approved shared Firebase UID, access rules/roles, write-disable mechanism, and a communication/maintenance window. None of this is approved yet. No secrets or raw fleet data in GitHub/CI logs.
4. Obtain two independently retrievable **complete** private original snapshots (legacy central source **and** full rich Fleet data) with exact SHA-256 of actual export bytes, records/history counts, nested-field preservation and recovery locations. Validate restore against separate offline copies. Back up the existing target state before any import. Include contacts, fuelCards, rich vehicle/driver histories, insurance, assignments and any other legacy fields.
5. Check document-size and schema constraints on the full data, especially Firestore's 1 MiB document limit. A JSON byte count is an early warning **not** a complete Firestore encoded-size proof. Do not truncate any rich fields to fit the limit. If the full original source cannot be safely represented, **STOP**.
6. Preserve immutable source SHA and independent privileged approval record. Full source → target equality must be verified; a generated or client-claimed digest is not sufficient.
7. Use synthetically seeded Auth/Firestore test environments first, including two distinct browser sessions and offline/reconnect/concurrent save races. Real-cloud post-import two-browser testing requires separately approved, controlled staging conditions.

## Proposed authorized cutover order (NOT executed)
1. Announce maintenance and **freeze all original writers** first, including old Apps Script endpoints, previously deployed clients, scheduled scripts and new-browser writes. Verify freeze from multiple existing client versions, not merely from the new UI. Fail closed if any client still writes.
2. Capture another final source snapshot **after** writer freeze; recheck SHA, sizes, record counts, history, and field parity. Protect backups from unrelated modifications.
3. Use only a separately approved trusted importer to seed the complete original canonical Fleet and approval record. Never enable a browser-driven overwrite before the source SHA and authorized UID can be independently verified.
4. With a controlled read-only stage, verify every imported record/field/history and same snapshot SHA; verify Rules, shared UID and bookings' authorization logic. If any mismatch, **STOP** and preserve both sources.
5. Enable the single Firestore writer **only after** the original writer is proven disabled, then verify an approved synthetic/controlled save, visibility in Depot, and both browser sessions. Observe errors and reconcile the write/audit log.
6. Preserve the final cutover evidence: immutable commit and artifact hashes, operator approvals, source/target snapshots, writer-freeze proof, authorized identities and exact test run links.

## Incident / rollback procedure (fail closed; requires fresh authorization)
1. On drift, unexpected writes, failed import or lost connectivity: immediately **freeze writes to BOTH generations**. Keep all committed data, logs, timestamps, client revision counters, and backups. Do not automatically switch either system to the other.
2. Take a **new post-incident** backup of each reachable source, including Firestore, *before* attempting any repair. A pre-cutover SHA proves only that old backup's identity, not freshness or authority.
3. Compare **pre-cutover, cutover and post-cutover snapshots** and reconcile all legitimate writes by revision/time/user/audit history. Assign the authoritative source explicitly; if uncertain, stay read-only and escalate.
4. Prefer a forward repair where safe. For an exceptional legacy-system rollback, separately approve: the reconciled target data, disabling every Firebase writer, checking every old Apps Script client, and restoring from a **current reconciled** source. Verify exact read-back before re-opening one writer. No automated live deletion; maintain an immutable history.
5. Verify that **exactly one** generation can write, demonstrate two-client visibility, and document completion and GO sign-offs. If any proof is absent, continue **NO-GO / read-only**.

## Offline QA evidence and limitations
- `features/v1-synthetic-backup-restore.test.mjs` tests synthetic file write/read, SHA tampering, missing fields, revisions and oversized-document warning. It is *not* a real Firebase snapshot export/restore, and does not validate Google Apps Script deployments.
- The new bridge's `gateOldSync()` currently shadows `window.pushRemote` and `window.pullRemote` when invoked, but cannot remotely disable legacy endpoints or already-open old clients.
- Remaining hard blockers: complete private backup/restore drill, old-writer disable proof, two-browser real-cloud post-import verification, duplicate DA/plate Rules hard stop, independent Grok + ChatGPT GO and express owner release approval.

**STOP:** This is a procedure, not permission to deploy, rotate UID, delete any document, or touch real data.
