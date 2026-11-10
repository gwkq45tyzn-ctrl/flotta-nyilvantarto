# V1 Release Candidate – 2026-11-10

**Ág:** `grok/v1-identity-hardstop-20261110`  
**HEAD:** (this commit)  
**Döntés:** **NO-GO** (duplicate identity hard-stop not proven; #133 attacks remain open)

## Verified on prior SHA 33f87c0
- #139 integrated: modular SDK identity claim booking.
- #138 integrated: DA hyphen/underscore normalization fix.
- Local contract tests pass (12/12).

## This commit adds
- Counter-based identity proposal (`docs/COUNTER_BASED_IDENTITY_PROPOSAL.md`).
- Documents that claim-only protection does not deny the five #133 attacks.
- Documents that Rules cannot iterate arrays to prove whole-array uniqueness.
- Documents the structural alternative (one document per identity).

## Proven [T]
- Post-import contract tests (6/6) – source structure only.
- Two-browser post-import contract tests (6/6) – source structure only.
- Synthetic backup/restore (4/4).
- Bridge runtime regressions pass.
- #139 emulator tests reported SUCCESS by ChatGPT on the source SHA.

## Nyitott
- True structural hard-stop for duplicate DA/plate (requires one document per identity or a counter protocol that Rules can enforce).
- Real two-browser post-import Flotta→Depó UI chain with original Flotta HTML.
- Full CI on this new SHA.
- Rules deploy, UID swap, real migration (after approval).

## GO feltételek
1. Full CI green on frozen SHA.
2. Real two-browser post-import UI chain passes.
3. Duplicate identity hard-stop with emulator evidence (#133 attacks denied even with claim write).
4. Separate Grok GO + ChatGPT GO + owner authorization.

**Jelölés:** [S] statikus, [T] automatizált, [E] emulator, [B] böngésző, [L] live, [N] nem ellenőrzött.
