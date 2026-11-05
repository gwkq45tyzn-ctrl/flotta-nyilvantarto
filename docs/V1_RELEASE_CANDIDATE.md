# V1 Release Candidate – 2026-11-05

**Ág:** `grok/v1-integrated`  
**PR:** #114  
**HEAD:** (this commit)  
**Döntés:** **NO-GO** (pending duplicate hard-stop emulator proof and full CI re-run on this SHA)

## Verified CI on 1471512 (all 6 SUCCESS)
- Flotta Firestore Bridge synthetic QA
- DepóKapacitás code and security
- staging-only integration tests
- restricted one-account Rules and migration QA
- real two-browser Auth/Firestore emulator QA
- independent dual release approval QA

## This commit adds
- Duplicate identity hard-stop in booking transaction.
- Booking fails closed if normalized DA code or plate appears more than once in canonical Flotta arrays.
- Client-side check; Rules still recompute eligibility from original fields.

## Proven [B+E] on prior SHAs
- #126: original Fleet vehicle form edit, Firestore save, second UI readback, rich data preserved.
- #127 + 16dba5f: five concurrent save rounds reached revision 12; revoked editor denied.
- #128: active editor cannot overwrite protected migration SHA through bounded retries (both SDKs).
- #129: full Flotta→Depó booking E2E proven.
- #132: original Flotta HTML integrity restored; stale modal protection in bridge.

## Nyitott
- Duplicate identity hard-stop emulator proof (client-side check added; Rules cannot iterate arrays for uniqueness).
- Full CI re-run on this new SHA.
- Rules deploy, UID swap, real migration (after approval).

## GO feltételek
1. Full CI green on frozen SHA.
2. Duplicate identity hard-stop with emulator evidence (or documented limitation with safe alternative).
3. Separate Grok GO + ChatGPT GO + owner authorization.

**Jelölés:** [S] statikus, [T] automatizált, [E] emulator, [B] böngésző, [L] live, [N] nem ellenőrzött.
