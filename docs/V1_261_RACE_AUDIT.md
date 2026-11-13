# #261 race audit – 2026-11-13

**SHA:** `ff1cb47109e0a84aef2c3573f155df20ae085ba6`

## Verified
- Real Chromium + original Fleet HTML + firestore-bridge.js.
- gateOldSync replaces pushRemote/pullRemote before login, after wrong password, offline, hard refresh and logout.
- Any Apps Script network request fails the test.
- CI SUCCESS for Chromium, signed-in Rules and two-browser contexts.

## Race observations
- The bridge already guards dirty local changes and revision conflicts.
- No new race that can be fixed locally without external privileged isolation.

**Scoped Grok GO** for the #261 real Chromium gate proof.  
**Full V1 NO-GO** (P0 remains RED).
