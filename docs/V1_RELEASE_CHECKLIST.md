# V1 release checklist – 2026-11-13

**Base:** #247 `6b03132185de257200b6d9c2f1b81b86d2258f57`

## Completed locally (scoped GO)
- Original full Fleet HTML preserved and integrated with shared navigation.
- Local duplicate/orphan hardstop in bridge.
- Read-only four-block backup validation (no fixed record count).
- Synthetic fencing, Ed25519, highwater and receipt designs.
- Chromium, signed-in Rules and bridge CI green on #247.

## Requires owner access / external decision
- Live Apps Script inventory (script IDs, triggers, owners, write destinations).
- Real privileged importer IAM isolation.
- Independently authenticated owner trust root and durable anti-rollback that survives privileged reset.
- Verified production encoded size and actual data migration dry-run with owner-approved backup.
- Dual independent FULL GO on the same frozen SHA + explicit owner production approval.

## Not done / still NO-GO
- Original P0 poisoned privileged-seed index-zero booking remains RED.
- No production deploy, main merge or live data migration performed.

**Full V1 NO-GO** until the external items are closed or explicitly accepted.
