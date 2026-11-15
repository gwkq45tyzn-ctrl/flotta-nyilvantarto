# iMile V1 Apps Script / legacy writer inventory — static code evidence only

**Status: NO-GO for production cutover; deployment/trigger status remains explicitly UNKNOWN.** Locations are function blocks, not frozen line numbers. The structural test finds `gateOldSync` wherever it sits, and still requires the call after `boot` and after `verifyMember` on both the login and restored-session paths. This is **not a live Google account/deployment inventory**. No endpoint, trigger, or Sheet was accessed or disabled.

## Verified source-code paths (function blocks)

| Repository source | Actual operation visible in code | Impact / classification |
|---|---|---|
| `index.html` constant `DEFAULT_BACKEND_URL` | Original Fleet HTML defines a historical Apps Script backend URL and localStorage key (the URL is not repeated in this inventory) | Potential legacy Fleet remote endpoint; **deployment unverified** |
| `index.html` function `pullRemote` | Original `pullRemote` performs JSONP readback and replaces local Fleet arrays | Read path can reintroduce stale data in an old browser |
| `index.html` function `configureBackend` | `configureBackend` accepts and stores an Apps Script `/exec` URL | Per-browser endpoint selection; not visible from GitHub |
| `index.html` function `save` and function `pushRemote` | `save` queues `pushRemote`, which POSTs `{action:'save', data:snapshot}` with `mode:'no-cors'` and confirms by JSONP `requestId` | **Fleet writer in source.** Opaque `no-cors` is not success evidence. This path does not call `syncAttendance` and does not write `flottaSharedState` |
| `index.html` function `init` | `init` reloads cached/pending data; `pullRemote` every 7 seconds and on focus | Stale open pages can keep calling the legacy backend |
| `flotta-nyilvantarto-elesitesre.html` function `pushRemote` | Second full Fleet HTML copy with the same `DEFAULT_BACKEND_URL` pattern and `pushRemote` POST | Same writer shape, different file; deployment still UNKNOWN |
| `flotta-bejelentkezes-v18.html` constant `DEFAULT_BACKEND_URL` | Alternate HTML sets `DEFAULT_BACKEND_URL` to an empty string | Not a baked-in endpoint |
| `flotta-bejelentkezes-v18.html` function `fleetPost` and function `pushRemote` | `fleetPost` plus `pushRemote` still POST `{action:'save'}` when a token and backend URL exist | Separate legacy build; repo presence is not deployment |
| `features/firestore-bridge.js` function `gateOldSync` | Replaces `window.pushRemote` and `window.pullRemote` with no-ops. The body does not call `fetch` or `UrlFetchApp` | Browser-local only. Does not disable a deployed page or a server trigger |
| `features/firestore-bridge.js` function `patchLogin` | `gateOldSync()` runs only after `verifyMember` accepts the shared account | Server-verified Auth path. A rejected profile signs out before the gate |
| `features/firestore-bridge.js` function `resumeIfSession` | `gateOldSync()` runs only after `verifyMember` accepts a restored session. The invalid-profile branch does not call it | Session path |
| `features/firestore-bridge.js` function `boot` | `boot` calls `gateOldSync()` as soon as `save` exists, and only then calls `resumeIfSession` | Pre-auth gate. It still cannot stop a page that never loads the bridge |
| No `doGet` / `doPost` in repository `.gs` files | The Fleet web app that would receive `action:'save'` is not in this repo | Server behavior of the historical `/exec` endpoint is UNKNOWN |
| `depokapacitas/google-sync/Code.gs` function `syncAttendance` | Reads a named Sheet under a script lock, then `UrlFetchApp.fetch` commits Firestore REST `attendance/{id}` in batches of 200 | **Attendance writer in source.** It does not write `flottaSharedState` and it does not send `action:'save'`. Project id in source is still a placeholder |
| `depokapacitas/google-sync/Code.gs` function `installFiveMinuteTrigger` | Would install a 5-minute `syncAttendance` trigger; `resetAttendanceImport` resets the watermark | Defining the function is not proof the trigger is installed |
| `depokapacitas/google-sync/appsscript.json` | Manifest requests spreadsheets.readonly, datastore, script.external_request, and script.scriptapp | The datastore scope is broader than the attendance-only commit in `Code.gs`. Scope grant on a live project is UNKNOWN |

**Explicit distinction:** the source contains **two categories of potential remote writers**: the original Fleet legacy `pushRemote` path and the separate attendance-to-Firestore Apps Script `syncAttendance`. They must not be conflated. The latter has an unresolved deployment status and is **excluded from narrowed Flotta+Depó V1 release scope**, but may warrant a separately approved audit because it has a Google Sheet and OAuth scope. The existence of a Sheet identifier and default backend URL in legacy source must not be repeated in GitHub issue comments, logs or runbooks; never publish credentials or personal records.

## UNKNOWN — externally deployed writer evidence (must not be guessed)

- Which of the legacy Fleet HTML variants or Apps Script `/exec` deployments is currently live, if any
- Deployed Apps Script project IDs and actual versioned webapp URL mappings
- Apps Script trigger installation, execution records, privileges, active service account/IAM, and owner identities
- Actual data destination and write behavior of the historical Fleet `/exec` endpoint
- Whether old browser/localStorage configurations still refer to an active endpoint
- Any linked Google Sheet IDs apart from static source; their contents, permissions or live writing status
- Whether the attendance `syncAttendance` script has ever been installed or activated
- The final production cutover and rollback authority

## BLOCKED_OWNER_ACCESS — three read-only console steps

GitHub cannot see deployed scripts. These steps need the owner's Google account. Do not paste deployment ids, URLs, Sheet ids, or execution logs back to GitHub.

1. Apps Script home, read-only: list projects and versioned deployments that could serve the historical Fleet `/exec` web app. Record whether any deployment is live, who owns it, and whether `doGet`/`doPost` still accept `action:'save'`. The server source is not in this repository.
2. Same account, read-only: open the separate Attendance project (the one matching `depokapacitas/google-sync/Code.gs`) and list installed triggers. Confirm whether `syncAttendance` runs on a timer, which identity executes it, and that its writes stay on `attendance/{id}`.
3. Google Cloud IAM for the Firebase project, read-only: list principals that hold Firestore write (`datastore.user` or Firebase Admin). Classify each as Fleet importer, Attendance sync, browser/user, or unknown. Do not remove bindings in this step.

**Non-negotiable:** No live endpoint calls, Google Script/Schedule install/removal, Sheet writes, IAM or UID mutation, main merge, production deploy, billing, or migration based on this repository inventory. Final V1 still requires Grok and ChatGPT independent GO on the same frozen SHA plus user approval under #83.
