# V1 Release Candidate – 2026-11-05

**Ág:** `grok/v1-integrated`  
**PR:** #114  
**HEAD:** `effc474` (integrates #123 at `815d653`)  
**Döntés:** **NO-GO** (pending real post-import UI chain and Claude duplicate hard-stop)

## Verified on prior SHA ba11340
- All 6 GitHub Actions workflows SUCCESS (ChatGPT verified on fb54f43; this SHA is newer).

## This commit integrates #123
- Capacity now comes only from Fleet `kapacitas`/`capacity`. Old `/driverCapacities` and `/drivers` mirrors cannot inflate or manufacture capacity.
- Unicode plate lookalikes rejected before upper(). Original plate must match `^[A-Za-z0-9 -]{4,40}$`.
- Missing capacity is invalid, never silently authorized as zero.
- 220 positive/negative emulator checks reported by ChatGPT on the source SHA.

## Proven [T]
- Post-import contract tests (6/6).
- Synthetic backup/restore (4/4).
- Bridge runtime regressions pass.

## Nyitott
- Real two-browser post-import Flotta→Depó UI chain with original Flotta HTML.
- Claude duplicate DA/plate server-side hard-stop (not yet proven; one of two duplicates was still bookable).
- Full CI re-run on this new SHA.
- Rules deploy, UID swap, real migration (after approval).

## GO feltételek
1. Full CI green on frozen SHA.
2. Real two-browser post-import UI chain passes.
3. Claude independent security review of duplicate identity hard-stop with emulator evidence.
4. Separate Grok GO + ChatGPT GO + owner authorization.

**Jelölés:** [S] statikus, [T] automatizált, [E] emulator, [B] böngésző, [L] live, [N] nem ellenőrzött.
