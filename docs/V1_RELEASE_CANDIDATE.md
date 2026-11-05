# V1 Release Candidate – 2026-11-05

**Ág:** `grok/v1-integrated`  
**PR:** #114  
**HEAD:** (this commit)  
**Döntés:** **NO-GO** (pending real post-import UI chain proof and duplicate hard-stop)

## Verified CI (all 6 SUCCESS on 01feac4)
- Flotta Firestore Bridge synthetic QA
- DepóKapacitás code and security
- staging-only integration tests
- restricted one-account Rules and migration QA
- real two-browser Auth/Firestore emulator QA
- independent dual release approval QA

## This commit adds
- `staging/imile-management/fleet/v1-post-import-two-browser.e2e.mjs`: real post-import two-browser E2E skeleton using original index.html against local Auth/Firestore emulators.
- Seeds approved migration gate and Fleet snapshot with matching SHA.
- Two independent browser contexts log in and unlock.
- Workflow updated to run the new E2E.

## Proven [T]
- Post-import contract tests (6/6) – source structure only.
- Two-browser post-import contract tests (6/6) – source structure only.
- Synthetic backup/restore (4/4).
- Existing original Fleet browser E2E proves pre-import read-only and login unlock.
- New post-import two-browser E2E skeleton ready for CI run (not yet proven on this SHA).

## Nyitott
- Real post-import two-browser UI chain proof (E2E skeleton created; needs CI run).
- Duplicate DA/plate server-side hard-stop (Claude track; not yet proven).
- Full CI re-run on this new SHA.
- Rules deploy, UID swap, real migration (after approval).

## GO feltételek
1. Full CI green on frozen SHA.
2. Real post-import two-browser UI chain passes in CI.
3. Duplicate identity hard-stop with emulator evidence.
4. Separate Grok GO + ChatGPT GO + owner authorization.

**Jelölés:** [S] statikus, [T] automatizált, [E] emulator, [B] böngésző, [L] live, [N] nem ellenőrzött.
