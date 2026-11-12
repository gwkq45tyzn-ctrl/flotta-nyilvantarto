# Keyed write + readback status – 2026-11-12

**Base:** #212 `495fbbf31f43231ea6548085fa5780f2ab241058`

## Added
- `tools/v1-keyed-write-readback.test.mjs`: synthetic emulator test that writes keyed master + claim under fencing, then verifies readback.
- Poisoned source is not written.
- Seal remains refused without production IAM.

## Honest boundary
`withSecurityRulesDisabled` is test-only. This does not prove a production service-account importer. The P0 poisoned privileged-seed job remains intentionally RED.

**Scoped Grok GO** for the local keyed write + readback pattern.  
**Full V1 NO-GO**.

No production, no main merge, no live migration.
