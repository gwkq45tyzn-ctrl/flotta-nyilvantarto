# iMile V1 Apps Script / legacy writer inventory — static code evidence only

**Status: NO-GO for production cutover; deployment/trigger status remains explicitly UNKNOWN.** Source re-checked at `2dfa84f7ba5b8f8d10aeb45c9f7983894ae733c1`. Earlier file:line pins had drifted (the Fleet `pushRemote` writer is `index.html:1220-1254`, not `1214-1254`, and `gateOldSync` is also invoked at boot, not only after login). This is **not a live Google account/deployment inventory**. No endpoint, trigger, or Sheet was accessed or disabled.

## Verified source-code paths (exact file and line range)

| Repository source | Actual operation visible in code | Impact / classification |
|---|---|---|
| `index.html:1157-1161` | Original Fleet HTML defines a historical Apps Script backend URL and localStorage key (the URL is not repeated in this inventory) | Potential legacy Fleet remote endpoint; **deployment unverified** |
| `index.html:1186-1198` | Original `pullRemote` performs JSONP readback and replaces local Fleet arrays | Read path can reintroduce stale data in an old browser |
| `index.html:1199-1211` | `configureBackend` accepts and stores an Apps Script `/exec` URL | Per-browser endpoint selection; not visible from GitHub |
| `index.html:1212-1254` | `save` queues `pushRemote`, which POSTs `{action:'save', data:snapshot}` with `mode:'no-cors'` and confirms by JSONP `requestId` | **Fleet writer in source.** Opaque `no-cors` is not success evidence |
| `index.html:1255-1268` | `init` reloads cached/pending data; `pullRemote` every 7 seconds and on focus | Stale open pages can keep calling the legacy backend |
| `flotta-nyilvantarto-elesitesre.html:1152-1153` and `:1212-1246` | Second full Fleet HTML copy with the same `DEFAULT_BACKEND_URL` pattern and `pushRemote` POST | Same writer shape, different file; deployment still UNKNOWN |
| `flotta-bejelentkezes-v18.html:1103` | Alternate HTML sets `DEFAULT_BACKEND_URL` to an empty string | Not a baked-in endpoint |
| `flotta-bejelentkezes-v18.html:1141-1145` and `:1229-1254` | `fleetPost` plus `pushRemote` still POST `{action:'save'}` when a token and backend URL exist | Separate legacy build; repo presence is not deployment |
| `features/firestore-bridge.js:547-561` | `gateOldSync()` replaces `window.pushRemote` and `window.pullRemote` with no-ops | Browser-local only. Does not disable a deployed page or a server trigger |
| `features/firestore-bridge.js:741` | Called after a successful shared-account login | Auth path |
| `features/firestore-bridge.js:785` | Called when a restored session still has a valid member profile | Session path |
| `features/firestore-bridge.js:834-841` | `boot` calls `gateOldSync()` as soon as `save` exists, before login | Earlier inventory missed this pre-auth gate. It still cannot stop a page that never loads the bridge |
| No `doGet` / `doPost` in repository `.gs` files | The Fleet web app that would receive `action:'save'` is not in this repo | Server behavior of the historical `/exec` endpoint is UNKNOWN |
| `depokapacitas/google-sync/Code.gs:13-20` | Separate `syncAttendance` reads a named Sheet under a script lock | **Attendance**, not the Fleet `pushRemote` path |
| `depokapacitas/google-sync/Code.gs:65-80` | `UrlFetchApp.fetch` commits Firestore REST `attendance/{id}` in batches of 200 | **Attendance writer in source.** `flottaSharedState` is not written here. Project id in source is still a placeholder |
| `depokapacitas/google-sync/Code.gs:98-105` | `installFiveMinuteTrigger` would install a 5-minute `syncAttendance` trigger; `resetAttendanceImport` resets the watermark | Defining the function is not proof the trigger is installed |
| `depokapacitas/google-sync/appsscript.json:5-9` | Manifest requests spreadsheets.readonly, datastore, script.external_request, and script.scriptapp | The datastore scope is broader than the attendance-only commit in `Code.gs`. Scope grant on a live project is UNKNOWN |

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
