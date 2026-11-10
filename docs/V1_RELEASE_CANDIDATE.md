# V1 Release Candidate – 2026-11-10

**Ág:** `grok/v1-identity-hardstop-20261110`  
**PR:** (new branch from #114)  
**HEAD:** `8c3e43b`  
**Döntés:** **NO-GO** (duplicate identity hard-stop partial; #133 attacks remain open)

## What was added
- Identity claim documents: `/flottaDriverClaims/{normalizedDa}` and `/flottaVehicleClaims/{normalizedPlate}`.
- Booking create requires claim exists and `sourceIndex` matches booking index.
- Claim write requires Fleet row normalization match.

## What this stops
- A booking that selects an index whose identity does not match the claim for that normalized ID.
- A booking that has no claim for the selected identity.

## What this does NOT stop
- A direct SDK update that inserts duplicate DA codes or plates into the Fleet arrays.
- A direct SDK update that also writes a claim for only one of the duplicates.
- Rules still cannot iterate the arrays to reject the Fleet update itself.

## Remaining gap
The #133 attacks that insert duplicates into the Fleet document and then book by selecting the eligible index are still possible if the attacker also writes the corresponding claim. The claim makes the attack harder, but does not make it impossible.

## Proven [T]
- Post-import contract tests (6/6) – source structure only.
- Two-browser post-import contract tests (6/6) – source structure only.
- Synthetic backup/restore (4/4).
- Bridge runtime regressions pass.

## Nyitott
- True structural hard-stop for duplicate DA/plate (requires one document per identity).
- Real two-browser post-import Flotta→Depó UI chain with original Flotta HTML.
- Full CI on this new SHA.
- Rules deploy, UID swap, real migration (after approval).

## GO feltételek
1. Full CI green on frozen SHA.
2. Real two-browser post-import UI chain passes.
3. Duplicate identity hard-stop with emulator evidence (#133 attacks denied even with claim write).
4. Separate Grok GO + ChatGPT GO + owner authorization.

**Jelölés:** [S] statikus, [T] automatizált, [E] emulator, [B] böngésző, [L] live, [N] nem ellenőrzött.
