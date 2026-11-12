# V1 signed source / registry high-water / fencing epoch binding — LOCAL only

**Date:** 2026-11-12.  
**Original #240:** `d61710e3187e909a6219f42920f62e8ca0259560`.  
**Grok submitted skeleton:** `94e47c65a380ce7addabcb646f2eaee6a728a09b` (#241).  
**Independent executable correction:** ChatGPT #242. **Full V1 remains NO-GO.**

## Independent review

Grok's original `SignedSourceHighwater.check(sourceSha, registrySequence)` did not use either input. It always returned DENY after reading a caller-supplied `externalPrivilegedIsolationVerified` boolean, with only two static offline tests. Denial was safe, but **no cryptographic source/registry linkage, real Firestore transaction or persisted receipt was executed**, and there was no exact-SHA CI on the original head. Its local scoped GO is valid only for the fail-closed sketch, not a signed-source implementation.

## What has actually been proven with executable code

`staging/imile-management/fleet/v1-local-signed-source-epoch-binding.mjs` first requires **two real Ed25519 signatures** relative to a synthetic, locally selected public root: root-signed offline registry and selected registry signer-signed **original full-rich Fleet source manifest**, including pinned source SHA, revision, canonical normalized DA/plate plan and complete original backup. Original nested histories, metadata and future fields must match. Revoked/disabled/expired signer and wrong audience/project/pin fail closed.

Next, ONE real `firebase/firestore runTransaction` consistently reads:
1. `v1SyntheticOwnerRegistryHighwater/current`: persisted signed registry sequence, full registry digest, root fingerprint, synthetic project/audience and signer revocation set;
2. `v1MigrationSyntheticLocks/primary`: genuine active epoch, source SHA, source revision, complete exact ordered plan, fully verified journal and no previous seal;
3. `v1SyntheticSignedSourceEpochBindings/current`: previous source/registry/epoch receipt (if any), rejecting conflicting evidence;
4. All known source-derived **full-rich keyed master and immutable claim pairs**, 3 pairs in the test (9 documents including controls), comparing every SHA-256 including nested history/unknown fields/sourceIndex/revision/source/master digests.

A matching *synthetic only* receipt is written atomically in that transaction or verified idempotently. The proof is intentionally limited to **at most 24 known pairs**, with all release flags FALSE. It neither atomically inventories unknown document IDs across four collections nor prevents a privileged out-of-band writer acting after commit.

The actual emulator CI forks **three separate Node OS processes with distinct PIDs**, using ORIGINAL full restricted Firestore Rules, verifying simultaneous safe idempotent binding, fresh-process readback, and the signed-in browser's inability to forge the source receipt. Negative live SDK tests include wrong epoch, wrong independently pinned source SHA, tampered original nested history, altered source signature, root-signed signer revocation, and an externally privileged modification of an immutable claim, which stops the next binding.

**CRITICAL ACTUAL VULNERABILITY EVIDENCE:** another test-only privileged OS process can reset registry high-water from root-signed revoked sequence 2 back to signed sequence 1; a restarted process then accepts the previously revoked signer's source again. This is not production antirollback, no matter how green the local validation or how many real signatures it checks. An external privileged writer can also forge, erase or rewrite source receipts, locks, keyed/claim docs, and sealed source documents. Client Firestore Rules cannot restrict the Admin SDK.

## Unresolved FULL V1 blockers

Real owner-authenticated out-of-band Ed25519 trust-anchor registration; durable **externally protected** signed-registry high-water with real trusted time and current revocation; actual isolated auditable privileged importer/service account and COMPLETE census of any other Admin SDK/Apps Script writers; server-enforced fenced source publication and whole-namespace/claim cutover; real production size and migration recovery. Original `p0-poisoned-privileged-source-hardstop` remains genuinely RED because malformed privileged-seeded normalized-duplicate index-zero booking can still pass. Never weaken, disable, invert, skip or waive that adversarial test.

**Scoped GO:** cryptographic source-to-registry-to-existing-epoch-to-known-rich-claims **local emulator transaction**, with explicit true privileged bypass counterexample. **FULL V1: NO-GO.**

Do not merge `main`, deploy staging/production, modify real IAM/UID or Apps Script/Sheets, migrate real customer data, subscribe to paid services or schedule monitoring. Full release requires independently verified ChatGPT and Grok FULL same-SHA GO and the user's separate explicit release approval.
