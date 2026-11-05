# V1 Release Candidate – 2026-11-05

**Ág:** `grok/v1-integrated`  
**PR:** #114  
**HEAD:** (this commit)  
**Döntés:** **NO-GO** (pending two-browser post-import UI and Claude duplicate hard-stop)

## Verified on prior SHA b127cbc
- All 6 GitHub Actions workflows SUCCESS (ChatGPT verified).
- #119 integrated: Rules recompute eligibility from original rendszam; capacity from Fleet kapacitas; SHA fail-closed.

## This commit adds
- Synthetic backup/restore SHA and field parity tests (`features/v1-synthetic-backup-restore.test.mjs`).
- Apps Script cutover and rollback plan (`docs/APPS_SCRIPT_CUTOVER_PLAN.md`).

## Tesztek [T]
```bash
node --check features/firestore-bridge.js
node --test features/v1-synthetic-backup-restore.test.mjs features/firestore-bridge.runtime-regressions.test.cjs
```
Syntax OK, backup/restore 3/3 pass, bridge regressions pass.

## Nyitott
- Two-browser post-import Flotta→Depó UI chain (separate from local emulator browser workflow).
- Claude duplicate DA/plate server-side hard-stop (separate track).
- Full CI re-run on this new SHA.
- Rules deploy, UID swap, real migration (after approval).

## GO feltételek
1. Full CI green on this SHA.
2. Two-browser post-import UI chain passes.
3. Claude independent security review of duplicate identity hard-stop.
4. Separate Grok GO + ChatGPT GO + owner authorization.

**Jelölés:** [S] statikus, [T] automatizált, [E] emulator, [B] böngésző, [L] live, [N] nem ellenőrzött.
