# V1 Release Candidate – 2026-11-05

**Ág:** `grok/v1-integrated`  
**PR:** #114  
**HEAD:** `2dae2c4` (integrates #120 at `389e2df`)  
**Döntés:** **NO-GO** (pending two-browser post-import UI and Claude duplicate hard-stop)

## Verified on prior SHA 82b316f
- All 6 GitHub Actions workflows SUCCESS (ChatGPT verified).
- #119 integrated: Rules recompute eligibility from original rendszam; capacity from Fleet kapacitas; SHA fail-closed.

## This commit integrates #120
- Apps Script cutover plan corrected: no destructive rollback (re-enable + Firestore delete). Fail-closed recovery requires dual independent snapshots.
- Synthetic backup/restore strengthened: actual file write/read, SHA verification, tampered backup rejection, revision conflict protection.
- 4/4 backup tests pass.

## Tesztek [T]
```bash
node --check features/firestore-bridge.js
node --test features/v1-synthetic-backup-restore.test.mjs features/firestore-bridge.runtime-regressions.test.cjs
```
Syntax OK, backup/restore 4/4 pass, bridge regressions pass.

## Nyitott
- Two-browser post-import Flotta→Depó UI chain.
- Claude duplicate DA/plate server-side hard-stop (separate track).
- Full CI re-run on this new SHA.
- Rules deploy, UID swap, real migration (after approval).

## GO feltételek
1. Full CI green on this SHA.
2. Two-browser post-import UI chain passes.
3. Claude independent security review of duplicate identity hard-stop.
4. Separate Grok GO + ChatGPT GO + owner authorization.

**Jelölés:** [S] statikus, [T] automatizált, [E] emulator, [B] böngésző, [L] live, [N] nem ellenőrzött.
