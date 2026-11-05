# V1 Release Candidate – 2026-11-05

**Ág:** `grok/v1-integrated`  
**PR:** #114  
**HEAD:** `1c1b2e7`  
**Döntés:** **NO-GO** (pending full Flotta→Depó booking E2E proof, real form parallel conflict, and duplicate hard-stop)

## Verified CI (all 6 SUCCESS on 1c1b2e7)
- Flotta Firestore Bridge synthetic QA
- DepóKapacitás code and security
- staging-only integration tests
- restricted one-account Rules and migration QA
- real two-browser Auth/Firestore emulator QA
- independent dual release approval QA

## Proven [B+E] on prior SHAs
- #126: original Fleet vehicle form edit, Firestore save, second UI readback, rich data preserved.
- #127 + 16dba5f: five concurrent save rounds reached revision 12; revoked editor denied.
- #128: active editor cannot overwrite protected migration SHA through bounded retries (both SDKs).

## This commit adds
- Flotta→Depó E2E extended: Flotta vehicle km modified via form, saved, Depó shared fleet view shows the vehicle.
- E2E skeleton ready for CI run (not yet proven on this SHA).

## Nyitott
- Full Flotta→Depó booking E2E proof (E2E extended but not yet CI-proven; booking step not yet included).
- Real Flotta form parallel modification conflict handling.
- Duplicate DA/plate server-side hard-stop (Claude track; not yet proven).
- Full CI re-run on this new SHA.
- Rules deploy, UID swap, real migration (after approval).

## GO feltételek
1. Full CI green on frozen SHA.
2. Full Flotta→Depó booking E2E passes in CI.
3. Real Flotta form parallel conflict handling proven.
4. Duplicate identity hard-stop with emulator evidence.
5. Separate Grok GO + ChatGPT GO + owner authorization.

**Jelölés:** [S] statikus, [T] automatizált, [E] emulator, [B] böngésző, [L] live, [N] nem ellenőrzött.
