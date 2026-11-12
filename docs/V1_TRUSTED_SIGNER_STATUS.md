# V1 trusted signer: real LOCAL Ed25519 chain, not production owner authority

**2026-11-12 — original Grok skeleton:** `64c265af25d09f3c9f89cd6293e13b77fe8b7d02`, based on #234 `c4264d3933a45e1cb46c06c918881acfaa3e7400`.

## Independent audit of original

The original `externalRegistryEntry.signerId` matching a `candidateManifest.signerId` used plain-text equality. Any constructor caller could choose both; it was not a signed registry or a verified signer. The default NO-REGISTRY denial and the permanent NO-SEAL decision were correct. No original exact-head CI evidence was available.

## Local proof implemented in #236

- Generate ephemeral **Ed25519** registry root and source signer keypairs **only in synthetic tests**, never use production keys.
- Independently *configured* SHA-256 fingerprint pins root DER SPKI; real root Ed25519 signature verifies canonical registry payload (schema, purpose, demo registry audience and source project, strictly increasing local version sequence, bounded not-before/expiration, versioned signer keys and signed revoked fingerprints).
- Registry selects the highest-version signer key for the expected signer identity. Original rich Fleet source manifest must be Ed25519-signed by that selected key, with source SHA-256, revision, canonical identity plan digest, full rich preimport backup, normalized DA/plate identity uniqueness, sourceIndex and nested histories verified by existing `SignedManifestContract`.
- Reject forged registry-root signature, text-equal signer ID, attacker-selected key, wrong source signer, altered nested history, source/plan SHA or backup, audience/project/revision drift, revoked/disabled/expired signer, expired registry, malformed data and duplicate signer/key definitions.
- Track last valid signed registry sequence and detect equal-version equivocation **only in memory within one local process**. A signed newer revocation prevents the same process from falling back to a prior accepted registry. **Test explicitly demonstrates that a new process can accept an older root-signed registry** if no durable authenticated high-water mark is configured.
- `verify()` never accepts a caller-supplied owner approval, signer ID, source pin, authority flag, IAM permission or wall-clock override. **All production authorization and seal fields remain FALSE**, even when both local signatures and source content match.

## Hard security boundary: NOT full V1 GO

**A locally configured root fingerprint does not prove its real owner**, even when the Ed25519 signatures are mathematically valid. Anyone can create their own synthetic root/registry/source and pass a matching fingerprint to their own contract. Actual release still needs: independently verified out-of-band owner root enrollment, root/registry signature provenance, trusted clock and durable monotonic registry version/revocation, real least-privileged server importer IAM, isolation of **all** alternate privileged/Admin SDK/Apps Script writers, and atomic source/claim publish-and-seal evidence. Four ordinary collection scans, or even a transaction reading only the known document set, cannot exclude unknown or later privileged writes.

The unchanged `p0-poisoned-privileged-source-hardstop` blocking security test remains RED: a separate privileged writer can seed malformed normalized-duplicate data and cause hostile index-zero booking. Never weaken or waive that test.

**Scoped verdict:** LOCAL TEST CRYPTOGRAPHIC CHAIN ONLY, conditional on exact-head CI. **Full V1: NO-GO.**

No `main` merge, deployment (even staging), real data/customer migration, live IAM/UID/service account, deployed Apps Script/Sheets changes, paid tools or automations. Final V1 release requires independent ChatGPT+Grok FULL GO on the SAME frozen SHA followed by the owner's separate explicit permission.
