# V1 P0 release design — no client-side atomic seal, no real owner trust root

**Date:** 2026-11-12  
**Basis:** #225 `6b961a859f4c34756f5acb36295a4488b36c5908` and independent QA #227  
**Current verdict:** FULL V1 **NO-GO**. Existing privileged-poisoned source/index-zero booking attack remains RED.

## Actual proof inside the free/local scope

1. A local Ed25519 public key may be verified against a separately configured fingerprint, finite validity window, offline revoked-fingerprint list, and registry version. `verify(candidate)` never accepts caller-chosen time. This is **key-material + offline lifecycle consistency**, NOT real owner authentication. Calling code can still construct a self-consistent fake root/fingerprint; a real independently controlled, auditable root registry has not been supplied.
2. Ed25519 cryptographic source manifest verification in #225 authenticates a signature **relative to the local public key**, including synthetic project, signer, revision, audience/purpose, source SHA and keyed plan digest. The synthetic key in CI is not a production owner key; no IAM, approvals, or key lifecycle infrastructure has been created.
3. Full rich keyed master + claim content parity and four original Firestore SDK collection query results detect missing/forged/extra documents **at the time they are read**. The checkpoint lock is read through Firestore transactions before/after the scan, but all four collections are **not** read as one atomic snapshot. A privileged out-of-plan write may land between checks or immediately afterward. A successful review CANNOT grant seal. The code marks `canSeal:false`, `atomicNamespaceSnapshotVerified:false` and `productionIamVerified:false` even on green local checks.
4. Actual original full restricted Firestore Rules, 440 rich keyed masters + 440 claims and multi-Node OS process fencing/recovery tests from #219/#222 remain synthetic/local. They are not production privileged server identity verification.

## What a future genuine release would require

- **Trust anchor ownership:** Independently approved registration of a genuine signer public key and fingerprint in a protected trust registry, with documented owner identity, key rotation, replay prevention, revocation distribution/freshness, and trusted validity clock. Nothing here registers any real key.
- **One trusted privileged import path:** A real, narrowly scoped and auditable server service principal with independently authenticated source/backup, monotonic persisted fencing epochs and stale-client denial. No authorization may originate solely from client-supplied booleans, constructor parameters, a source snapshot hash or a local signed test fixture.
- **Whole-namespace safety at cutover:** All possible privileged/master/claim writers must be inventoried and excluded/controlled; freeze and verify source and allowed write set, prove master and claim pair completeness, and prevent privileged out-of-plan inserts between final audit and seal. Four ordinary collection queries and the source lock alone are NOT sufficient. The existing P0 test must turn GREEN because the real hostile booking is blocked, not because it was changed or skipped.
- **Operational cutover gates:** Production Firestore encoded size and real provider limits, exact-head original Chromium + restricted-Rules E2E, authenticated crash recovery and staged rollback, all deployed Apps Script web apps/triggers/owners/execution identities/writer destinations verified in authorized read-only inventory, and independent same-SHA ChatGPT + Grok FULL GO followed by the user's explicit permission.

## Restrictions

No `main` merge, staging or production deployment, live IAM/UID/service account setup, real customer/source migration, Apps Script/Sheets modifications, paid tools or scheduled jobs are allowed at this phase. Never weaken the poisoned privileged-source P0 test or turn its deliberate failure into a release waiver. This document is a design and evidence boundary, **not** an implementation of production IAM or a production seal.
