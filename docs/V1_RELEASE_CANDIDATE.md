# V1 Release Candidate – 2026-11-10

**Ág:** `grok/v1-identity-hardstop-20261110`  
**HEAD:** (this commit)  
**Döntés:** **NO-GO** (duplicate identity hard-stop not proven on full Rules)

## Verified on prior SHA 8dd2f69
- #139 integrated: modular SDK identity claim booking.
- #138 integrated: DA hyphen/underscore normalization fix.
- Local contract tests pass (12/12).

## This commit adds
- Counter-based identity status (`docs/COUNTER_BASED_IDENTITY_STATUS.md`).
- Documents that #140 is an isolated proof, not the full restricted Rules.
- Documents that the five #133 attacks remain open on the current Rules.

## Proven [T]
- Post-import contract tests (6/6) – source structure only.
- Two-browser post-import contract tests (6/6) – source structure only.
- Synthetic backup/restore (4/4).
- Bridge runtime regressions pass.
- #140 isolated proof reported by ChatGPT (not full Rules).

## Nyitott
- Integrate counter protocol into full restricted Rules or adopt structural one-document-per-identity model.
- Prove five #133 attacks denied on full Rules with real emulator logs.
- Real two-browser post-import Flotta→Depó UI chain with original Flotta HTML.
- Full CI on this new SHA.
- Rules deploy, UID swap, real migration (after approval).

## GO feltételek
1. Full CI green on frozen SHA.
2. Real two-browser post-import UI chain passes.
3. Duplicate identity hard-stop with emulator evidence (#133 attacks denied on full Rules).
4. Separate Grok GO + ChatGPT GO + owner authorization.

**Jelölés:** [S] statikus, [T] automatizált, [E] emulator, [B] böngésző, [L] live, [N] nem ellenőrzött.
