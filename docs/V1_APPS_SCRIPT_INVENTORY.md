# V1 Apps Script / legacy writer inventory (GitHub static only)

**Status: NO-GO.** GitHub cannot prove deployed script IDs, triggers, or owners.

## Known code surfaces (from repository)

| Location | Surface | Write destination | Notes |
|----------|---------|-------------------|-------|
| Original `index.html` / inline | Historical Apps Script sync flags, localStorage primary | Possibly old Sheets or remote | Pre-seal read-only now enforced by bridge |
| `features/firestore-bridge.js` | `pushRemote` / `pullRemote` gated after seal | `flottaSharedState` | Client gate does not disable external deployments |
| Restricted Rules | Deny client seal / array mutation | `flottaSharedState` | Server hard-stop after #176 |
| Staging / QA fixtures | Synthetic only | None | No live endpoints |

## Unknown (must be inventoried outside GitHub)
- Deployed Apps Script project IDs
- Web app URLs / doPost endpoints
- Time-driven or installable triggers
- Linked Google Sheet IDs
- Execution identities / owners

## Cutover readiness template (private, owner-run)
1. List all Apps Script projects in the authorized account.
2. For each: record script ID, version, triggers, linked Sheet (redacted), owner.
3. Classify real writers vs read-only.
4. Verify post-seal Rules reject old-style writes in emulator.
5. After separate authorization only: disable verified triggers.

**No live inventory or disable performed.** Unknown writers remain open blockers.
