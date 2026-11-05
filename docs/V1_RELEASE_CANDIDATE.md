# V1 Release Candidate – 2026-11-05

**Ág:** `grok/v1-integrated`  
**PR:** #114  
**HEAD:** `868acf7`  
**Döntés:** **NO-GO** (pending real post-import UI chain and Claude duplicate hard-stop)

## Verified CI (all 6 SUCCESS on 868acf7)
- Flotta Firestore Bridge synthetic QA: https://github.com/gwkq45tyzn-ctrl/flotta-nyilvantarto/actions/runs/42013136226
- DepóKapacitás code and security: https://github.com/gwkq45tyzn-ctrl/flotta-nyilvantarto/actions/runs/42013135456
- staging-only integration tests: https://github.com/gwkq45tyzn-ctrl/flotta-nyilvantarto/actions/runs/42013136226
- restricted one-account Rules and migration QA: https://github.com/gwkq45tyzn-ctrl/flotta-nyilvantarto/actions/runs/42013135460
- real two-browser Auth/Firestore emulator QA: https://github.com/gwkq45tyzn-ctrl/flotta-nyilvantarto/actions/runs/42013135175
- independent dual release approval QA: https://github.com/gwkq45tyzn-ctrl/flotta-nyilvantarto/actions/runs/42013135168

## Proven [T]
- Post-import contract tests (6/6).
- Two-browser post-import contract tests (6/6): requeue, dirty protection, gateOldSync, getAfter, capacity from Fleet only, Unicode plate rejection.
- Synthetic backup/restore (4/4).
- Bridge runtime regressions pass.

## Integrated
- #119: Rules recompute eligibility from original rendszam; capacity from Fleet kapacitas; SHA fail-closed.
- #120: fail-closed Apps Script rollback; nontrivial synthetic backup/restore.
- #123: canonical-only capacity; Unicode plate hard-stop; missing capacity invalid.

## Nyitott
- Real two-browser post-import Flotta→Depó UI chain with original Flotta HTML (existing synthetic emulator browser tests pass; full UI chain not yet proven).
- Claude duplicate DA/plate server-side hard-stop (not proven; one of two duplicates was still bookable; Claude paused).
- Rules deploy, UID swap, real migration (after approval).

## GO feltételek
1. Full CI green on frozen SHA (verified on 868acf7).
2. Real two-browser post-import UI chain passes.
3. Duplicate identity hard-stop with emulator evidence (ChatGPT track).
4. Separate Grok GO + ChatGPT GO + owner authorization.

**Jelölés:** [S] statikus, [T] automatizált, [E] emulator, [B] böngésző, [L] live, [N] nem ellenőrzött.
