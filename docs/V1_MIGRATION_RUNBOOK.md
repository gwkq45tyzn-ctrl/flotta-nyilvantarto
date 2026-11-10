# V1 Migration Dry-Run, Backup & Restore Runbook

**Scope:** Synthetic / offline only. No live data, no production Firebase, no Apps Script publish.

## 1. Preflight
```bash
node tools/v1-migration-dryrun.mjs preflight --input=synthetic-full-snapshot.json
```
Checks:
- All four arrays present (vehicles, drivers, fuelCards, contacts)
- Normalized DA / plate uniqueness
- Rich fields + history preserved in plan
- Source SHA-256
- Size < 1 MiB

## 2. Dry-run plan
Generates keyed plan with revision=1, sealed=true, full rich copy.
Never creates approval or seal from client.

## 3. Backup / Restore drill
- `simulateBackup` produces full rich JSON + SHA
- `restoreDrill` refuses on SHA mismatch
- Interrupted batch detected via `detectPartial`

## 4. Rollback
If partial keyed docs exist after failed privileged write:
- Delete only the incomplete keyed documents created by this plan (by sourceSha256 match)
- Restore original `flottaSharedState/current` from backup (immutable after seal)
- Never roll back a sealed source that has already been accepted

## 5. Apps Script hard-stop plan (dry-run only)
- Identify old Google Apps Script writer endpoints that write to `flottaSharedState`
- In staging: disable trigger / remove write permission
- After trusted seal: Rules already deny further writes to sealed arrays
- Legacy browser clients must be frozen (no localStorage primary flag without server approval)
- Document residual manual steps for owner before any real cutover

## Residual manual steps (never automated here)
- Real privileged migration execution (requires owner GO + separate credentials)
- Apps Script project unpublish / trigger deletion
- Real UID provisioning
- Production Rules / Hosting deploy

**This tool and tests are synthetic only. No live migration performed.**
