# V1 Release Candidate – 2026-11-05

**Ág:** `grok/v1-integrated`  
**PR:** #114  
**HEAD:** `c2b29b0` (integrates #124 at `108a856`)  
**Döntés:** **NO-GO** (pending real post-import UI chain and duplicate hard-stop)

## Verified CI (all 6 SUCCESS on f318936; this SHA is newer)
- Flotta Firestore Bridge synthetic QA
- DepóKapacitás code and security
- staging-only integration tests
- restricted one-account Rules and migration QA
- real two-browser Auth/Firestore emulator QA
- independent dual release approval QA

## This commit integrates #124
- Post-import contract tests now run in CI.
- RC evidence URLs corrected.
- Source-only tests labeled accurately (NOT browser UI E2E).

## Proven [T]
- Post-import contract tests (6/6) – source structure only.
- Two-browser post-import contract tests (6/6) – source structure only.
- Synthetic backup/restore (4/4).
- Bridge runtime regressions pass.
- Existing original Fleet browser E2E proves pre-import read-only and login unlock.

## Nyitott
- Real two-browser post-import Flotta→Depó UI chain with original Flotta HTML (not yet proven; existing E2E is pre-import only).
- Duplicate DA/plate server-side hard-stop (#122 proved SDK bypass; still open; Claude paused).
- Full CI re-run on this new SHA.
- Rules deploy, UID swap, real migration (after approval).

## GO feltételek
1. Full CI green on frozen SHA.
2. Real two-browser post-import UI chain passes.
3. Duplicate identity hard-stop with emulator evidence.
4. Separate Grok GO + ChatGPT GO + owner authorization.

**Jelölés:** [S] statikus, [T] automatizált, [E] emulator, [B] böngésző, [L] live, [N] nem ellenőrzött.
