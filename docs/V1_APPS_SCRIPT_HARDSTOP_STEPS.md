# V1 legacy Apps Script cutover — evidence-based checklist (not executed)

**Release status: NO-GO.** This document DOES NOT identify a verified live Apps Script deployment, trigger, executable endpoint or owner. All examples are for the isolated synthetic QA project; do not use this text to authorize disabling a production integration.

## Known source-code integration surfaces

- The original full Flotta HTML contains its own historical Apps Script synchronization logic and local browser cache/primary flags. A separate V1 Firestore bridge gates the old browser `pushRemote` and `pullRemote` methods when the bridge is initialized.
- The V1 restricted Firestore Rules deny privileged source creation and approval/seal writes by ordinary clients; after seal, archived driver/vehicle arrays remain immutable.
- Those client-side gates **do not disable already deployed Apps Script triggers or older browser deployments**. Only a verified per-endpoint inventory and explicit cutover can establish there are no parallel writers.
- The exact deployed script IDs, webapp URLs, execution identities, connected Sheets and time-driven triggers have **NOT been verified**. They must be discovered from the authorized configuration and privately cross-checked; never paste secrets or customer data into GitHub.

## Non-destructive dry-run inventory and verification

1. In the authorized Google account, list relevant Apps Script projects and deployments. For each record its script ID, version, linked Sheet ID (redact), owner, triggers, execution role, URLs, functions, and the actual write destination in a private inventory. Never guess an endpoint.
2. Review both source and deployed versions: do any active `doPost`, installable/time-driven trigger, `UrlFetchApp` call, `SpreadsheetApp` update or third-party webhook still write to Fleet source sheets, Firebase or import-related datasets? Classify real writers versus read-only operations using execution logs and server-side traces.
3. Rehearse a change in a disposable staging copy only. Verify stale clients and old scripted writes are rejected at the final sealed source with actual Rules, regardless of locally stored primary flags; verify new keyed Fleet capacity/status still reaches Depot.
4. Create and verify a complete local backup and independent source SHA proof **before any authorized shutoff**. Record an exact rollback/recovery runbook without overwriting a successfully sealed source.
5. After **separate user approval** for cutover, disable every verified legacy trigger/deployment writer at the correct side and observe negative write probes, read-only behavior, required business continuity and logs. Production controls are not changed by this repository or QA tool.

## Synthetic emulator guard evidence

```bash
npx --yes firebase-tools@15.34.2 emulators:exec \
  --only firestore --project demo-imile-migration \
  --config firebase.staging-emulator.json \
  "node tools/v1-migration-emulator-drill.mjs"
```

This exercise loads actual complete restricted V1 Rules and proves with a signed-in synthetic client that keyed creates, browser approval/seal and unseal are denied. The separately privileged synthetic testing context writes keys only after full local preflight and recorded batches, detects interruption/checkpoint forgery and rich-data tampering, uses a transaction for server readback + final seal, and restores only a separate **scratch** namespace. No real Apps Script endpoint or production credentials are accessed.

**Remaining release blockers:** proof of exact legacy writer inventory and shutoff, actual Firestore encoded document-size measurement, independent privileged identity/infrastructure deployment design and separately verified rollback capability, residual #133/#141 preseal adversarial attacks and new keyed identity lifecycle create/rename/delete support policy. A local emulator PASS is not production migration authorization.
