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

## Proven [B+E]
- #126: original Fleet vehicle form edit, Firestore save, second UI readback, rich data preserved.
- #127 + 16dba5f: five concurrent save rounds reached revision 12; revoked editor denied.
- #128: active editor cannot overwrite protected migration SHA through bounded retries (both SDKs).

## This commit adds
- `staging/imile-management/fleet/v1-flotta-depo-e2e.mjs`: Flotta→Depó E2E skeleton.
  - Browser 1: original Flotta HTML, login, unlock.
  - Browser 2: Depó HTML, page load.
  - Workflow updated to run the new E2E.
- E2E skeleton ready for CI run (not yet proven on this SHA).

## Nyitott
- Full Flotta→Depó booking E2E (skeleton created; needs CI run for proof).
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
