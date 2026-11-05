# V1 Release Candidate – 2026-11-05

**Ág:** `grok/v1-integrated`  
**PR:** #114  
**HEAD:** `e3a560f` (integrates #120 at `2dae2c4` / `389e2df`)  
**Döntés:** **NO-GO** (pending two-browser post-import UI chain and Claude duplicate hard-stop)

## Verified CI (all 6 SUCCESS on current branch)
- Flotta Firestore Bridge synthetic QA
- DepóKapacitás code and security
- staging-only integration tests
- restricted one-account Rules and migration QA
- real two-browser Auth/Firestore emulator QA
- independent dual release approval QA

## Integrated
- #119: Rules recompute eligibility from original rendszam; capacity from Fleet kapacitas; SHA fail-closed.
- #120: fail-closed Apps Script rollback (no destructive re-enable + delete); nontrivial synthetic backup/restore with file I/O, SHA, tamper rejection, revision conflict protection.

## Tesztek [T]
```bash
node --check features/firestore-bridge.js
node --test features/v1-synthetic-backup-restore.test.mjs features/firestore-bridge.runtime-regressions.test.cjs
```
Syntax OK, backup/restore 4/4 pass, bridge regressions pass.

## Nyitott
- Two-browser post-import Flotta→Depó UI chain (separate from local emulator browser workflow).
- Claude duplicate DA/plate server-side hard-stop (separate track, not yet delivered for review).
- Rules deploy, UID swap, real migration (after approval).

## GO feltételek
1. Full CI green on this SHA (verified).
2. Two-browser post-import UI chain passes.
3. Claude independent security review of duplicate identity hard-stop.
4. Separate Grok GO + ChatGPT GO + owner authorization.

**Jelölés:** [S] statikus, [T] automatizált, [E] emulator, [B] böngésző, [L] live, [N] nem ellenőrzött.
