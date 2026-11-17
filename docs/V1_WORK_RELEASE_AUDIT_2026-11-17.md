# Flotta + Depó: Work release audit, 2026-11-17

Full production decision: **NO-GO**. This is source and synthetic local-emulator evidence. No live data, UID/IAM, Apps Script, deployment or main merge was performed. Grok is unavailable; Work does not replace #83's independent Grok approval.

## Reviewed source and completed rounds

| Round | Exact source | Evidence | Next obstacle |
|---|---|---|---|
| Baseline #369 | `55b32188f13735054084beae37572096e07fc752` | 7/7 workflow SUCCESS; inspected integrated Chromium log, run 43864065264 | Independent source/backup/capacity audit |
| #370 | `f8fb2a15e7d45a0fe12c55b100dc7e7758f4dfd0` | 35 local targeted PASS; 4/4 workflow SUCCESS; variable-block emulator 44056835001, integrated Chromium 44056834860 | Open driver form could overwrite second browser |
| #371 | `a343b5dfe308bdafb312be1a00e561d3a8b78ac5` | 15 bridge tests PASS; 7/7 workflow SUCCESS; run 44057279372 logs show stale 75 blocked after remote 65, reviewed reopen 70 allowed in source AND artifact browsers | Missing/blank capacity became implicit zero |
| #373 | `03fe58a2f5fa0754d1e9668fa30cecd25a4b72f4` | 18 original form/package checks PASS; 7/7 workflow SUCCESS; integrated Chromium 44057791284 | Complete regression coverage and saved-backup recovery integration |

The current branch includes all three rounds and reviewed #372 (`d5b20dd2b00bb2875d3ccd92d28351105cdc9202`). #372 validates v2/preimport/four-count backup envelopes and performs recovery from an independently saved file in scratch emulator collections. Its local targeted suite passed 47 tests after integration. It does not authenticate the private source's origin.

The broad baseline run found 11 failures in obsolete textual S7 checks, one obsolete empty-source checkpoint expectation, and three emulator-only entry points run without the mandatory emulator. No emulator skip was added. Updated contracts require current keyed capacity, normalized raw plate, immutable archive provenance and getAfter keyed authority; the empty source must now be denied by operational readiness. The complete core runner separates the three mandatory emulator entry points into a required emulator lane. Offline lane: **461 PASS, zero FAIL/skip** locally. Consolidated CI now requires both lanes, variable-block migration, saved-file restore and original Chromium flows on its PR HEAD. Current-head remote verdict must be read from actual CI; these local results alone do not authorize release.

## S1–S12 assessment

| Gate | Current scoped finding | Remaining production evidence |
|---|---|---|
| S1 | Full original Fleet retained; reviewed HTML blob `acf57b157804ee9b14026ef388c0a354d66e517f`; six original pins retained. Build stays BLOCKED. | Freeze final exact SHA, artifact/Rules/migration hashes after all CI; obtain both independent audits. |
| S2 | Synthetic one-account Auth/UID/member positive and negative tests execute. | Real UID, Firebase project and effective role/IAM verification; placeholder remains intentional. |
| S3 | Actual restricted Rules emulator, poisoned-source denial and canonical booking positive controls run. | No inference that production Rules/IAM match the emulator. |
| S4 | All four rich arrays, unknown map keys, SDK/protobuf sizing, interrupted migration and saved-file recovery tested synthetically. | Private full export + pending/local reconciliation, independently retained backup/readback/hash, actual private encoded-size measurement and authorized rollback plan. |
| S5 | Two independent authenticated Chromium contexts verify cross-SDK propagation/conflict/offline/revocation. Driver modal now blocks stale input before mutation. | Authorized real staging multi-PC proof, with actual configuration. |
| S6 | Original Fleet parity and fail-closed legacy bridge tests retained; repository inventory reviewed. | Deployed webapp versions, owners, execution identities, installed/time triggers, write destinations and stale clients remain UNKNOWN. No script was disabled. |
| S7 | Current keyed capacity is authoritative; future planning changes 80→70 without rewriting stored 80; explicit zero allowed; missing capacity has no default. | Actual private capacities need owner review; no blanket 70 assignment. |
| S8 | OFD/In-Hub/Excel deferred by owner; excluded from first core package. | #83 full-scope release contract still requires independently reviewed scope/exclusion approval; deferred work is not a passed gate. |
| S9 | Original Fleet + actual Depó + emitted core artifact Chromium acceptance on same CI source. | Emulator Firebase modules are explicitly injected; production config/IAM is not proven. |
| S10 | No new paid service or production operation; private data never included in fixtures. | Effective Spark/deployment/privacy/monitoring and recovery evidence for real environment. |
| S11 | Broadened offline and mandatory emulator regression lanes; no continue-on-error or hidden skips. | Require all final exact-head jobs SUCCESS and inspect their logs. Historical green is not final-SHA green. |
| S12 | Core build tests exclude report/PWA/attendance/photo routes and prototype Fleet. | Same frozen artifact must be audited; no automatic activation or deployment. |

## Exact owner-access blockers and limits

1. Export the complete private original Fleet and reconcile pending browser edits before accepting a source pin. Keep the private JSON, backup and signatures off GitHub/CI. Verify saved bytes and all four arrays/history against a separately trusted pin.
2. Inspect actual Apps Script deployments, all versions/triggers and execution principals/destinations read-only. Supply a redacted complete inventory; external writer shutdown/cutover needs separate authorization.
3. Independently establish the signing trust root, source authority and persistent antirollback boundary, and verify the actual privileged importer IAM. A cooperating emulator writer or self-selected key is not this evidence.
4. The current local atomic close proof is bounded to **120 owned documents**, and canonical Rules accept at most **30 archived drivers**. Admission fails closed beyond either bound. The 440-record synthetic migration/rollback drill is not approval for a high-N production close. Private counts/shape are not inferred from synthetic fixtures.
5. Obtain independent Grok and ChatGPT signoff on the same frozen SHA/artifact and precise first-release scope; only then request the owner's exact-version production approval. Grok's absence remains RELEASE STOP.

No automatic production approval is requested by this document. Next technical step: inspect the integrated exact-head offline/emulator/Chromium results, repair any real failures, and freeze evidence only when the whole required matrix is green. Production GO remains unavailable without the above evidence.


## Wider CI correction

The first integrated run (44058427955 on `7be412967de71af30c4fa0ff10596878d7816317`) correctly failed its newly required 440-record lane: a source-content attestor had inherited the operational 120-document/30-driver admission rule. The old source-index browser workflow also failed an older HTML blob pin. Preserve every 440-record positive/negative threshold and separate content/backup/signature integrity from operational admission through differently named functions. Only explicitly demo/emulator guarded migration/recovery drills and no-write signature integrity use the content helper; operational importer admission continues through `verifyPinnedImportSource`, which has no caller option to bypass readiness. New 440-row offline proof verifies that content passes, operational import is denied, and tampering is still denied. Refresh the sixth HTML pin to the same reviewed original bytes; retain its actual browser job. Neither correction is evidence of a high-N production import capability.
