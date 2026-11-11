# Apps Script old write hard-stop steps (synthetic / staging only)

## Identified residual writers
- Legacy Google Apps Script projects that call `SpreadsheetApp` or `UrlFetchApp` targeting the old `flottaSharedState` document or Google Sheets that previously synced to it.
- Old browser localStorage primary flags that could re-enable pre-seal writes.

## Verifiable shutdown steps (dry-run)
1. List all Apps Script projects linked to the staging Google account that contain write operations to `flottaSharedState` or related sheets.
2. Disable time-driven triggers in each project (Apps Script dashboard → Triggers → delete).
3. Remove the script's ability to write by revoking the spreadsheet edit permission or commenting out the write functions (staging copy only).
4. After trusted seal, the restricted Rules already deny further writes to the sealed arrays; verify with a synthetic emulator probe that an old-style `setDoc` on `flottaSharedState/current` after seal is permission-denied.
5. Freeze legacy browser clients: clear `flotta_firestore_primary` and `flotta_import_verified` localStorage; force re-auth against the sealed source.

## Residual manual steps (owner only)
- Real Apps Script project unpublish / trigger deletion on production account.
- No script publishing or live switch is performed by this tool.

**No live modification performed.**
