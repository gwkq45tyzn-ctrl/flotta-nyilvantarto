# V1 Release Candidate – 2026-11-05

**Ág:** `grok/v1-integrated`  
**PR:** #114  
**HEAD:** (this commit)  
**Döntés:** **NO-GO** (pending real post-import UI chain and Claude duplicate hard-stop)

## Verified CI (all 6 SUCCESS on fb54f43)
- Flotta Firestore Bridge synthetic QA
- DepóKapacitás code and security
- staging-only integration tests
- restricted one-account Rules and migration QA
- real two-browser Auth/Firestore emulator QA
- independent dual release approval QA

## Proven [T]
- Synthetic backup/restore: file I/O, SHA parity, tamper rejection, revision conflict protection (4/4).
- Two-browser synthetic sync test passes (3/3).
- Post-import contract tests (6/6): gateOldSync, isPrimary, SHA match, rules recompute from original rendszam, capacity from Fleet, mirror writes closed.
- Bridge runtime regressions pass.
- Apps Script cutover plan is fail-closed (no destructive rollback).

## Integrated
- #119: Rules recompute eligibility from original rendszam; capacity from Fleet kapacitas; SHA fail-closed.
- #120: fail-closed Apps Script rollback; nontrivial synthetic backup/restore.

## Nyitott
- Real two-browser post-import Flotta→Depó UI chain with original Flotta HTML (separate from synthetic emulator browser workflow).
- Claude duplicate DA/plate server-side hard-stop (separate track; not yet delivered for review).
- Full CI re-run on this new SHA.
- Rules deploy, UID swap, real migration (after approval).

## GO feltételek
1. Full CI green on frozen SHA.
2. Real two-browser post-import UI chain passes.
3. Claude independent security review of duplicate identity hard-stop.
4. Separate Grok GO + ChatGPT GO + owner authorization.

**Jelölés:** [S] statikus, [T] automatizált, [E] emulator, [B] böngésző, [L] live, [N] nem ellenőrzött.
