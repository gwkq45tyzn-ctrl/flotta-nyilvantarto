# V1 Release Candidate – 2026-11-05

**Ág:** `grok/v1-integrated`  
**PR:** #114  
**HEAD:** `c49fa46` (integrates #126 at `3ba0fba`)  
**Döntés:** **NO-GO** (pending concurrent write fix, Depó booking E2E, and duplicate hard-stop)

## Verified CI on c1af06b (all 6 SUCCESS)
- Flotta Firestore Bridge synthetic QA
- DepóKapacitás code and security
- staging-only integration tests
- restricted one-account Rules and migration QA
- real two-browser Auth/Firestore emulator QA
- independent dual release approval QA

## Proven [B+E] on #126 source SHA
- PASS: original Fleet vehicle form edit persisted to REAL Firestore emulator with all rich data intact
- PASS: second independent original Fleet UI reflects edit without reload
- PASS: both browsers unlocked after approved import
- PASS: both browsers loaded rich approved source snapshot
- PASS: logout re-locks

## Known issue
- Synthetic concurrent write test (v1-two-browser-emulator.e2e.mjs) fails with permission-denied. Server revision stays at 3 instead of 4. This is a separate synthetic test, not the original Fleet UI path. Rules are not relaxed.

## This commit integrates #126
- Real original Fleet vehicle form edit (not localStorage mutation).
- Firestore server-side save verified.
- Second UI readback without reload.
- Rich data (history, capacity, fuel cards, contacts, SHA) preserved.

## Nyitott
- Concurrent write permission-denied in synthetic test (needs real cause investigation).
- Full Flotta→Depó booking E2E (Depó UI load and booking not yet in E2E).
- Duplicate DA/plate server-side hard-stop (Claude track; not yet proven).
- Full CI re-run on this new SHA.
- Rules deploy, UID swap, real migration (after approval).

## GO feltételek
1. Full CI green on frozen SHA.
2. Concurrent write issue fixed or proven non-blocking.
3. Full Flotta→Depó booking E2E passes.
4. Duplicate identity hard-stop with emulator evidence.
5. Separate Grok GO + ChatGPT GO + owner authorization.

**Jelölés:** [S] statikus, [T] automatizált, [E] emulator, [B] böngésző, [L] live, [N] nem ellenőrzött.
