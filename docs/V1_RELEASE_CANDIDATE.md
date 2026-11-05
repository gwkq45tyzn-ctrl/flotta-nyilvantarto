# V1 Release Candidate – 2026-11-05

**Ág:** `grok/v1-integrated`  
**PR:** #114  
**HEAD:** (this commit)  
**Döntés:** **NO-GO** (pending concurrent stress test proof, full Flotta→Depó booking E2E, and duplicate hard-stop)

## Verified CI on e49b351 (5/6 SUCCESS)
- Flotta Firestore Bridge synthetic QA: SUCCESS
- DepóKapacitás code and security: SUCCESS
- staging-only integration tests: SUCCESS
- restricted one-account Rules and migration QA: SUCCESS
- independent dual release approval QA: SUCCESS
- real two-browser Auth/Firestore emulator QA: FAIL (concurrent stress round)

## Known issue (fixed in this commit)
- Concurrent stress test: one client got permission-denied. Pre-retry check saw server revision 10 while the other client had already advanced to 11. Expected revision 12 was not created.
- Fix: on permission-denied, if still editor, always retry. The next transaction re-reads the current server revision. A revoked role is still hard-denied. Rules not relaxed.

## Proven [B+E] on prior SHAs
- #126: original Fleet vehicle form edit, Firestore save, second UI readback, rich data preserved.
- #127: five concurrent save rounds reached revisions 4/6/8/10/12 (before the stress failure).

## Nyitott
- Concurrent stress test proof on this new SHA (fix applied, needs CI run).
- Full Flotta→Depó booking E2E (Depó UI load and booking not yet in E2E).
- Real Flotta form parallel modification conflict handling.
- Duplicate DA/plate server-side hard-stop (Claude track; not yet proven).
- Full CI re-run on this new SHA.
- Rules deploy, UID swap, real migration (after approval).

## GO feltételek
1. Full CI green on frozen SHA.
2. Concurrent stress test passes multiple rounds.
3. Full Flotta→Depó booking E2E passes.
4. Duplicate identity hard-stop with emulator evidence.
5. Separate Grok GO + ChatGPT GO + owner authorization.

**Jelölés:** [S] statikus, [T] automatizált, [E] emulator, [B] böngésző, [L] live, [N] nem ellenőrzött.
