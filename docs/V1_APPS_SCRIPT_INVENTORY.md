# iMile V1 Apps Script / legacy writer inventory — static code evidence only

**Status: NO-GO for production cutover; deployment/trigger status remains explicitly UNKNOWN.** Source reviewed against Grok commit `2a2f8fbecd6fa59b1a27073c423f46cf40097a8f`. This is **not a live Google account/deployment inventory**. Neither live script activity nor actual deployment ownership can be determined from GitHub, and no endpoint, trigger, or Sheet was accessed or disabled.

## Verified source-code paths (exact file and line range)

| Repository source | Actual operation visible in code | Impact / classification |
|---|---|---|
| `index.html:1156-1163` | Original Fleet HTML defines a historical Apps Script backend URL/localStorage configuration (actual URL deliberately omitted here) | Potential legacy Fleet remote endpoint; **deployment unverified** |
| `index.html:1186-1196` | Original `pullRemote` performs JSONP readback and updates local Fleet arrays | Read path could reintroduce stale data in an old browser version |
| `index.html:1200-1207` | `configureBackend` accepts and stores a Google Apps Script `/exec` URL | Another possible endpoint selection; inspect private per-browser config before cutover |
| `index.html:1214-1254` | Original `save`/`pushRemote` creates pending local snapshot, sends `fetch(..., method:'POST', mode:'no-cors')`, confirms via JSONP requestId | **Actual writer implementation in source**; `no-cors` response alone is not success evidence; this code performs readback |
| `index.html:1257-1268` | Initialization reloads cached/pending data; `pullRemote` polls every 7 seconds and on window focus | Stale independently deployed browsers may still call legacy backend |
| `features/firestore-bridge.js:529-543` | Integrated V1 `gateOldSync()` shadows browser `pushRemote` and `pullRemote` | Browser-local guard only. **Does not remove old deployed pages, server-side trigger, or Apps Script endpoint** |
| `features/firestore-bridge.js:723-792` | Guard invoked in original bridge auth flow | Verify original HTML and bridge actually initialize for each controlled client; do not infer universal protection |
| `flotta-bejelentkezes-v18.html:1100-1180` | Alternative Fleet HTML has configurable Apps Script auth endpoint, JSONP reads and `no-cors` POST | Separate legacy build; presence in repository does NOT establish deployment |
| `flotta-nyilvantarto-elesitesre.html:1100-1260` | Another original Fleet variant with remote sync machinery | Treat as potential stale page/writer until specific deployment evidence is obtained |
| `depokapacitas/google-sync/Code.gs:13-20` | Separate `syncAttendance` reads a named Google Sheet and uses a watermark/lock | Different domain: **attendance**, not proof of Fleet-source writing |
| `depokapacitas/google-sync/Code.gs:65-80` | `UrlFetchApp.fetch` POSTs Firestore REST `documents:commit` for **`attendance/{id}`** in 200-write batches | **Real writer implementation in repository**; no evidence the required project ID has been configured or that the script was deployed |
| `depokapacitas/google-sync/Code.gs:98-104` | `installFiveMinuteTrigger` can create a recurring `syncAttendance` trigger; `resetAttendanceImport` resets watermark | Merely defining functions is **not proof trigger is installed**, active or authorized; do not run them |
| `depokapacitas/google-sync/appsscript.json` | Project manifest declares Apps Script scopes/config | Project source only; does not prove a live script installation |

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

## Safe next evidence steps — read-only first

1. With separately authorized access to the correct Google account, privately list versioned deployments, existing triggers, owner/execution identity, and linked Sheets; redact any identifiers, tokens, URLs and customer data from public GitHub.
2. Match *each verified deployment*, not assumed endpoints, to the source and its write destinations. Use a private, owner-controlled evidence register to classify `Fleet legacy`, `Attendance`, `read-only`, or `unknown`.
3. In a local synthetic emulator, verify stale original Fleet browser behavior fails closed at sealed authoritative Firestore state, and valid keyed Fleet writes still update Depot. This does not prove the older Apps Script API cannot write separate Sheets.
4. Only after owner authorization for the exact production cutover, stop confirmed legacy writers and independently recheck logs plus rollback/backup evidence. Never disable unknown integrations speculatively.

**Non-negotiable:** No live endpoint calls, Google Script/Schedule install/removal, Sheet writes, IAM or UID mutation, main merge, production deploy, billing, or migration based on this repository inventory. Final V1 still requires Grok and ChatGPT independent GO on the same frozen SHA plus user approval under #83.
