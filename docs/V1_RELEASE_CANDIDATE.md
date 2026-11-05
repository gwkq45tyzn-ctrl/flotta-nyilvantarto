# V1 Release Candidate – 2026-11-05

**Ág:** `grok/v1-integrated`  
**PR:** #114  
**HEAD:** `59f3fde` (integrates #127 at `7f7e7dd`)  
**Döntés:** **NO-GO** (pending full Flotta→Depó booking E2E and duplicate hard-stop)

## Verified CI on 29d4587 (all 6 SUCCESS)
- Flotta Firestore Bridge synthetic QA
- DepóKapacitás code and security
- staging-only integration tests
- restricted one-account Rules and migration QA
- real two-browser Auth/Firestore emulator QA
- independent dual release approval QA

## Proven [B+E] on #127 source SHA
- PASS: five consecutive concurrent save rounds reached server revisions 4, 6, 8, 10, 12 without lost updates
- PASS: revoked editor role still results in write denial
- Rules not relaxed

## Proven [B+E] on #126 source SHA
- PASS: original Fleet vehicle form edit persisted to REAL Firestore emulator with all rich data intact
- PASS: second independent original Fleet UI reflects edit without reload

## This commit integrates #127
- Synthetic client tracks revision actually read by the transaction.
- Retry only on proven revision change and valid editor permission.
- Rules not relaxed.

## Nyitott
- Full Flotta→Depó booking E2E (Depó UI load and booking not yet in E2E).
- Real Flotta form parallel modification conflict handling (not yet proven; #127 fixes synthetic client only).
- Duplicate DA/plate server-side hard-stop (Claude track; not yet proven).
- Full CI re-run on this new SHA.
- Rules deploy, UID swap, real migration (after approval).

## GO feltételek
1. Full CI green on frozen SHA.
2. Full Flotta→Depó booking E2E passes.
3. Real Flotta form parallel conflict handling proven.
4. Duplicate identity hard-stop with emulator evidence.
5. Separate Grok GO + ChatGPT GO + owner authorization.

**Jelölés:** [S] statikus, [T] automatizált, [E] emulator, [B] böngésző, [L] live, [N] nem ellenőrzött.
