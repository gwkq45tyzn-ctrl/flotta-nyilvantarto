# V1 owner-reviewed importer trust and local workpack — 2026-11-11

**CURRENT RELEASE VERDICT: NO-GO.** The following is a technical QA design, not an owner release instruction or proof of live IAM. No production/cloud project, live Google identity, scripts, user records, data migration or deployment is touched.

## Authoritative source and threat boundary

1. A real owner-approved importer must use an **independently authenticated read-only source export** and a securely pinned SHA-256 digest and revision. A backup may not testify to its *own* legitimacy by supplying its own digest. A local offline digest validates integrity relative to an external pin; it does not verify who approved the pin.
2. In trusted code before ANY write, validate strict original four arrays, all rich fields and history, per-array order, reserved field rejection (including preexisting `sourceIndex:0`), normalized unique DA/plates, internal IDs, source revisions and all proposed keyed paths.
3. Refuse source mismatch, malformed field names/depth, storage advisory overflow, unexpected keyed docs, forged journal, duplicate normalized identity and missing original history **before** any staged identity claims/privileged seal.
4. The importer must enforce **exclusive migration writer** privileges and separate IAM identity so signed-in browsers cannot create/update/delete migration approval, source checkpoints or keyed identity claims. Local `withSecurityRulesDisabled` runs as TEST-ONLY privileged bypass, **not** evidence such an IAM pipeline exists.
5. Verify source and ALL expected keyed masters by server readback, including external id/count/sha, unknown fields, sourceIndex, history and absence of extras. In the final commit, source/claim/checkpoint/approval must be tied to the same independently attested source and isolation/locking evidence. A transaction that reads only expected docs cannot prove no concurrently inserted *extra* doc unless the migration writer is exclusive.
6. Fail closed if a transaction cannot fit security/size/read or document limits. Production run must use a separately owner-approved reversible cutover/rollback playbook. Do not run privileged IAM or restore on actual data without explicit final owner authorization.

### Remaining real P0

The original `staging/imile-management/fleet/v1-forged-booking-index-probes.mjs` intentionally demonstrates that a **privileged-poisoned, normalized-duplicate sealed source** can still permit a signed-in index-zero booking. The legitimate atomic positive works. Changing Firestore Rules to reject all client bookings would be an invalid fake fix. A trusted pre-seal importer plus independently controlled source authorization must make such privileged poisoning unreachable. The P0 acceptance job is deliberately RED until this external trust boundary is actually proven.

## Additional same-SHA local QA source work

- #201 `5d9a914f0b5a8cf06984adacee8fb4af9b9dbb25`: 19/19 PINNED SHA source parity controls PASS in CI 43017901041; `authorizedForImport:false`, `trustedExternalProvenanceVerified:false`.
- #202 `2df07562e1fdd3fc2eec1c356df8ff8069a0700c`: [CI 43017372528](https://github.com/gwkq45tyzn-ctrl/flotta-nyilvantarto/actions/runs/43017372528) PASS local emulator, **220 full-rich drivers + 220 vehicles, 12 batches, 18 checkpoint validations**, interruption, forged checkpoint, rich-keyed tamper, orphan refusal, rollback preseal, resumed immutable seal, legitimate signed-in edit, hostile SDK DENY. SDK emulator accepted 880,000-byte UTF-8 string and rejected 1,080,000-byte string with `invalid-argument`. This is observed local acceptance/rejection, **NOT measured production SDK wire payload** or production importer proof.
- #203 `4ec72b76303d25ef534f778fd3a52a718d478153`: [CI 43017766248](https://github.com/gwkq45tyzn-ctrl/flotta-nyilvantarto/actions/runs/43017766248) PASS original Fleet HTML **stale unbridged POST intercepted locally** (1), integrated bridge legacy POST (0). No live Google request. Deployed Apps Script IDs/triggers/owner still UNKNOWN.
- Independent Grok final source `32471865805e1e7f1436386119f48917189165a2` is **status-only**: one Markdown file added to #200. It neither contains the #201-#203 source nor reruns their CI. Therefore it cannot inherit their QA verdict.
- Included Grok `tools/v1-poisoned-source-hardstop.test.mjs` from `e8b29454bab9e468da02204c66da2841f24e37dc` and cutover checklist from `1020277551451f7c17aa30fcd61e115637626695`; independently corrected #185 boundary regression so a legitimate oversized storage-size estimate does not have to return null, but **never** authorizes import.
- `.github/workflows/imile-v1-grok-workpack-matrix.yml` runs these three scopes on ONE exact PR SHA. Other full V1 integration P0/S1-S12 CI must also run against the same HEAD; historic green ancestor results cannot substitute.

### What remains outside locally proven tests

Actual independently authorized producer/source signature and production privileged importer/IAM; verified production encoded RPC/document size and real backup/cutover; actual deployed Google Apps Script trigger/project/writer audit with owner-approved read-only access; full S1–S12 one frozen SHA and independent Grok+ChatGPT GO; **user's final explicit release consent**.

**Release is NO-GO: do not main merge, deploy, install/disable triggers, use paid services, process real data, change real UID/IAM or start scheduled jobs.**
