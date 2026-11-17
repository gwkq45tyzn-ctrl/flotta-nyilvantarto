# Flotta + Depó V1: source, privacy and trust audit

Production decision: **NO-GO**. These changes do not authorize main merge, deployment, private import, IAM/UID/Rules edits or Apps Script changes. Grok remains a mandatory separate auditor under #83. A narrow core pass does not satisfy the full V1 gate.

## New reproducible corrections

| Draft | Reviewed source | Reproduced defect | Fix and local evidence |
|---|---|---|---|
| #383 | `73306aa57c2ab986a19824abeb96863f3891d5c7` | Private reader followed a growing EOF before checking bytes; same-size overwrite after preflight could be accepted. | Positional I/O bounded to original fd length + one detection byte; bigint inode/device/size/mtime/ctime comparison before and after. Two before-fail/after-pass OS-file regressions; 25 targeted PASS. |
| #384 | `2f367605140ce6d11c9135f54be47ca0ba160797` | Remaining importer/pinned-content/root wrappers leaked private getter errors or let them escape before their old catch. | Full public-boundary containment and constant DENY codes; existing privacy suite extended; 53 targeted PASS. Hashes, signature checks and sequence floors retained. |
| #385 | `3565d7227393377d6b20e04f2b986252b6ddf5a6` | A matching opaque Request ID was labelled a matching timestamp. | Capture token equality and strict timestamp-text classification; no freshness inferred. Schema v2, legacy input alias kept, capacity transition updated; 27 targeted PASS. |

The integrated current branch also blocks original fuel-card create/edit/delete/save before any local mutation. The Rules already freeze all four imported arrays; the prior form could replace a local rich row and queue a change the server would reject. Reading and the full original export remain available. This is an explicit read-only archive boundary, **not a completed writable fuel-card feature**. Restoring full auxiliary editing requires a separately audited current-data model; the immutable imported source must not be relaxed to enable it.

The complete dependency-free core suite passed 508 tests locally (zero failure/skip). Bridge coverage includes the new card pre-mutation/submit/export controls. Mandatory remote same-source acceptance still needs actual log inspection, including original Fleet/Depó Chromium, emitted core bytes, Firestore positive/negative, 440 rich master/claim receipts and interrupted recovery. Do not infer green from an ancestor.

## Private source examination (no source records in Git)

The connected native Sheet named by the owner was found through Drive search and its tab metadata was inspected. Two separate bounded `_APP_STATE` reads returned identical application version/token/full JSON. Version-history metadata was available. The second column is **Request ID**, not a trusted clock. The source's spreadsheet identity, raw captures, row values, checksum and personal/vehicle/card/contact fields are kept out of Git and CI.

A private backup package containing the exact original source cell bytes, both captures and a private integrity manifest was created outside the repository, opened again and checked for byte/hash/content parity, then saved to the user's authenticated file space. Its local files use owner-only filesystem permissions. No public sharing was requested. The actual saved source was checked offline with the pinned Firebase SDK/protobuf size reader and the source/readback gate; it fits the current tested size/read bounds but remains operationally unready because active capacities need explicit owner review. An offline reconstruction from the saved JSON passes full-rich parity and rejects a damaged backup envelope. None of this is a live Firestore restore or independent source-authority attestation.

Stable reads cannot rule out unsubmitted or offline changes in another original Fleet browser. The exact active legacy backend-to-Sheet mapping is not established by the filename or the consistency check. Before cutover, reconcile those browser drafts and establish a separately trusted source pin, with a new export if the source changes.

## Apps Script and Firebase evidence boundary

The Work browser attempted the Apps Script dashboard. It redirected to the official Apps Script information page; following its sign-in control showed a saved Google account explicitly **signed out**. No authenticated project, deployment, version, trigger, execution-principal or destination inventory was exposed. Nothing was installed, run, disabled or edited. This means **UNKNOWN**, not zero projects or no active writers. Connected Drive access does not authenticate that browser or grant the Apps Script API.

| Surface | Current verified result | Required next step |
|---|---|---|
| Actual script projects/deployments/webapp versions | UNKNOWN: browser has no signed-in session | Authenticate the intended owning Google account in the Work browser, then inspect read-only. |
| Installed/time-driven triggers and execution identities | UNKNOWN | Inspect every relevant project, trigger account and deployment identity read-only; retain a redacted inventory. |
| Active legacy writer destinations/stale clients | Source code inventory exists; deployed mapping unverified | Match actual deployment to original source, reconcile client drafts; future writer shutdown requires separate approval. |
| Production Firebase UID, effective IAM and deployed Rules | Not inspected/authenticated; repository placeholder intentionally remains | Read-only authorized console evidence of real project, principal/roles, writer isolation and deployed Rules hash; no live edits. |
| Independent Ed25519 root and persistent antirollback | Only synthetic roots and local contracts tested | Establish an independently authenticated root and minimum accepted state in a boundary the importer/rollback attacker cannot rewrite. |

## Privileged rollback finding retained

The genuine emulator counterexample remains required: a separately privileged datastore writer can reset registry highwater from a later revocation sequence to an older, correctly signed sequence; a new verifier can then accept revoked-signer receipts again. Ed25519 proves signed content, not that it is the latest allowed state. A memory variable, a second mutable document in the same writable database, or a caller's `IAM verified` flag cannot establish durable nonrollback authority. Production public gates stay denied. Do not remove this test, or call the vulnerability fixed by operator approval alone.

Current operational admission remains fail-closed at **30 archived drivers** and **120 owned close-read documents**. The 440-record drill demonstrates synthetic integrity/recovery and its explicit negative boundaries; it does not authorize high-N production closing.

## S1–S12 and final release work

S1/S11: inspect and freeze one exact candidate SHA/artifact/Rules/migration fingerprint after all required jobs pass. S2/S3/S5/S7/S9: current auth, booking, original rich source and browser tests are synthetic/demo evidence; real config and principal isolation are still unverified. S4/S6: private saved bytes now exist, but independent authority, pending-write reconciliation, deployed legacy cutoff and a separately approved cloud rollback remain open. S8: reports stay deferred; the full-scope release gate is not marked passed. S10: no new paid service or production mutation; real operational recovery/monitoring requires evidence. S12: core artifact exclusions remain mandatory. Full original parity is not claimed for writable auxiliary records.

Grok's separate exact-version GO, ChatGPT's independent exact-version GO and the owner's later explicit production authorization remain required. No approval is requested before the technical and access evidence is complete.
