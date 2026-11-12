# V1 registry antirollback: shared DEMO Firestore proof and real privileged bypass

**2026-11-12**  
**Base:** unified #237 `d501a719b7408d12482506e0fdc78ef4b22a09e6`  
**Grok original:** `aacb1afb7380a6d3efe96a552eda2063d523a5c2` — #238.  
**ChatGPT executable QA:** #239. **Full V1: NO-GO.**

## Independent original Grok finding

`DurableRegistryAntirollback` originally accepted `externalHighWater:number` supplied by its constructor, then compared `registrySequence` to that number and returned `ok:true` on a match. This is NOT persisted or independently authoritative, cannot survive/reconcile two real processes, and can be forged by a caller passing `externalHighWater:0`. Original had only three offline assertions and no exact-head CI. It correctly refused absent highwater and never allowed seal; its positive verdict was overclaimed. The root offline contract now always refuses an untrusted caller-supplied highwater as authority.

## Actual new local proof

The **synthetic only** module `staging/imile-management/fleet/v1-local-durable-signed-registry.mjs` executes genuine `firebase/firestore` read/write transactions against ONE `demo-imile-v1-registry-highwater` emulator document. It verifies a real Ed25519 signature by a locally configured/pinned root over the canonical registry containing expected synthetic project/audience, expiry, sequence and signed revoked signer fingerprints. Its strict transaction enforces:

- monotonic registry sequence and document revision across separate Node OS processes;
- rejection of same-sequence but different *root-signed* registry contents (equivocation);
- rejection of newer root-signed registry that silently drops a previously revoked fingerprint;
- refusal of stale/root-signature-invalid/expired registry after another process advances;
- idempotent current registry readback, with all seal/IAM/owner authorization fields FALSE.

The test **actually forks 2–3 independent Node OS processes** using separate SDK contexts, verified different PIDs, with ORIGINAL full restricted Firestore Rules. The original Rules deny a signed-in browser attempt to forge a highwater document. A freshly spawned process sees the shared persisted revision and rejects older signed registry despite having no prior in-memory state. It also verifies two simultaneous signed contenders for the SAME sequence lead to **exactly one** persisted digest, with the losing contender DENIED.

**Critically, the test intentionally proves the remaining security vulnerability:** after signed sequence 3 is persisted, a TEST-ONLY privileged SDK bypass **overwrites** the protected Firestore highwater with the original signed sequence 1 state. A separate freshly spawned process now accepts the OLD registry signature again. This is genuine evidence that a Firestore document + browser Rules + signed registry is NOT an independently protected production antirollback authority when unknown privileged writers exist.

## Missing release evidence

1. Authentic business-owner root enrollment and external signing provenance. A caller can create its own valid root and matching fingerprint; crypto integrity alone is not real owner authorization.
2. Real production IAM: ALL Admin SDK service accounts, deployed Apps Script writers and privileged write destinations must be independently inventoried and narrowed/isolated. Browser Rules cannot prevent privileged Admin SDK writes.
3. Durable tamper-evident monotonic registry root/sequence under an independently isolated trusted authority (not merely a Firestore doc the attacker can overwrite), verified rotation/revocation freshness and trusted clock.
4. Bind source-signed full-rich manifest, root/registry revision, migration epoch, all canonical masters/claims, recovery and publication to a single enforceable and authenticated privileged-server cutover model. Four SDK collection scans are not one atomic namespace snapshot.
5. Original `p0-poisoned-privileged-source-hardstop` still genuinely RED: an unknown privileged writer can seed poisoned normalized duplicate/index-zero booking data. Never weaken, skip, invert or waive that P0 test.

**Scoped verdict:** only local root-signed registry SHA highwater **transactional persistence under benign constrained writers**, with an explicit demonstrated privileged-bypass failure. **Not production antirollback or P0 closure.**

No main merge, staging/production deployment, real migration/customer data, IAM/UID/service-account modifications, deployed Apps Script/Sheets access/changes, paid systems or background automations. Final V1 requires both independent FULL same-SHA GO and owner's separate explicit authorization.
