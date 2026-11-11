# iMile V1 Apps Script / legacy writer inventory — static code evidence only

**Status: NO-GO for production cutover.**

## Identified code paths (summary)

- Original Fleet HTML (`index.html` and variants): historical `pushRemote` / `pullRemote` with potential Apps Script POST.
- `features/firestore-bridge.js`: browser-local gate that shadows old push/pull; does not disable deployed scripts.
- **Separate attendance writer:** `depokapacitas/google-sync/Code.gs` contains `syncAttendance` that POSTs to Firestore `attendance` collection and `installFiveMinuteTrigger()`. Distinct from Fleet source writer. **Deployment status UNKNOWN.**

## UNKNOWN (GitHub cannot verify)

Deployed project IDs, active triggers, owners, execution identities, linked Sheets, live endpoints.

All unverified external writers remain explicit NO-GO blockers until separately authorized read-only inventory on the Google account.

**No secrets or customer data URLs listed. No live disable performed.**
