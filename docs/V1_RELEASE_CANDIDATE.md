# V1 Release Candidate – 2026-11-06

**Ág:** `grok/v1-integrated`  
**PR:** #114  
**HEAD:** `d9de32d` (integrates #134 and #135)  
**Döntés:** **NO-GO** (duplicate identity hard-stop not proven)

## Verified CI (all 6 SUCCESS on bbcc488; this SHA is newer)
- Flotta Firestore Bridge synthetic QA
- DepóKapacitás code and security
- staging-only integration tests
- restricted one-account Rules and migration QA
- real two-browser Auth/Firestore emulator QA
- independent dual release approval QA

## This commit integrates
- #134: canonical restored fleet parity (backup/restore SHA and field checks).
- #135: hyphenated DA canonical booking (DA codes may contain '_' or '-'; only trim and uppercase).

## Proven [T]
- Post-import contract tests (6/6) – source structure only.
- Two-browser post-import contract tests (6/6) – source structure only.
- Synthetic backup/restore (4/4).
- Bridge runtime regressions pass.
- Existing original Fleet browser E2E proves pre-import read-only and login unlock.

## Nyitott
- Duplicate DA/plate server-side hard-stop (#133 attacks remain open; Rules cannot iterate arrays).
- Real two-browser post-import Flotta→Depó UI chain with original Flotta HTML.
- Full CI re-run on this new SHA.
- Rules deploy, UID swap, real migration (after approval).

## Identity claim proposal
See `docs/IDENTITY_CLAIM_PROPOSAL.md`. Claim documents in the same transaction can make booking harder against duplicates, but do not prevent a direct SDK Fleet update that creates the claims. A true structural solution requires one document per driver/vehicle.

## GO feltételek
1. Full CI green on frozen SHA.
2. Real two-browser post-import UI chain passes.
3. Duplicate identity hard-stop with emulator evidence (#133 attacks denied).
4. Separate Grok GO + ChatGPT GO + owner authorization.

**Jelölés:** [S] statikus, [T] automatizált, [E] emulator, [B] böngésző, [L] live, [N] nem ellenőrzött.
