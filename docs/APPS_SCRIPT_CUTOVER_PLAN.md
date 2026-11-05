# Apps Script Cutover and Rollback Plan (V1)

**Status:** PLAN ONLY – no live script changes, no deploy.

## Current state
- Original Flotta used Google Apps Script JSONP for remote sync.
- V1 bridge (`features/firestore-bridge.js`) gates old sync: `gateOldSync()` disables JSONP before and after sign-in.
- Firestore is the single canonical source after verified import.

## Cutover steps (owner-authorized only)
1. Export full Flotta localStorage + Firestore `flottaSharedState/current` as JSON.
2. Compute SHA-256 of the export. Record counts of vehicles, drivers, fuelCards, contacts, and history entries.
3. Confirm Firestore Rules and Auth are the only writers.
4. Disable Apps Script web app deployment (owner action in Apps Script console).
5. Verify no JSONP calls succeed (browser network tab or bridge status message).
6. Confirm Flotta save → Firestore → Depó onSnapshot path works.

## Rollback steps
1. Re-enable Apps Script web app deployment.
2. Restore the exported JSON to localStorage.
3. Clear Firestore `flottaSharedState/current` only if the export SHA matches the pre-cutover baseline.
4. Confirm old JSONP sync resumes.

## Dual-write prohibition
- The bridge must never call both Firestore and Apps Script for the same save.
- `gateOldSync()` enforces this. Any residual JSONP endpoint must return 404 or be disabled before cutover.
- No automatic dual-write fallback is permitted.

## Verification
- Synthetic test: bridge source contains `gateOldSync` and does not call JSONP when primary.
- Owner verification: Apps Script deployment disabled, no JSONP network calls after cutover.

**No live changes in this document.**
