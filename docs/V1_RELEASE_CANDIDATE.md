# V1 Release Candidate – 2026-11-05

**Ág:** `grok/v1-integrated`  
**PR:** #114  
**Utolsó teljesen ellenőrzött #114 HEAD:** `f31893679a94b3c2d935b3a24f1e0dec8700b73b`  
**Döntés:** **NO-GO** (pending real post-import UI chain and Claude duplicate hard-stop)

## Verified CI (all 6 SUCCESS on f318936)
- Flotta Firestore Bridge synthetic QA: https://github.com/gwkq45tyzn-ctrl/flotta-nyilvantarto/actions/runs/42020207761
- DepóKapacitás code and security: https://github.com/gwkq45tyzn-ctrl/flotta-nyilvantarto/actions/runs/42020207654
- staging-only integration tests: https://github.com/gwkq45tyzn-ctrl/flotta-nyilvantarto/actions/runs/42020207642
- restricted one-account Rules and migration QA: https://github.com/gwkq45tyzn-ctrl/flotta-nyilvantarto/actions/runs/42020207696
- real two-browser Auth/Firestore emulator QA: https://github.com/gwkq45tyzn-ctrl/flotta-nyilvantarto/actions/runs/42020207672
- independent dual release approval QA: https://github.com/gwkq45tyzn-ctrl/flotta-nyilvantarto/actions/runs/42020207775

## Proven [T]
- Post-import contract tests (6/6).
- Two-browser *source-level structural* contract tests (6/6): requeue, dirty protection, gateOldSync, getAfter, capacity from Fleet only, Unicode plate rejection. **These tests only assert text patterns: they never launch a browser, import a Fleet snapshot, or execute a real two-browser UI journey.**
- Synthetic backup/restore (4/4).
- Bridge runtime regressions pass.

## Integrated
- #119: Rules recompute eligibility from original rendszam; capacity from Fleet kapacitas; SHA fail-closed.
- #120: fail-closed Apps Script rollback; nontrivial synthetic backup/restore.
- #123: canonical-only capacity; Unicode plate hard-stop; missing capacity invalid.

## CI evidence boundary
- All six GitHub Actions jobs reported success on `f318936`, but this does not constitute owner or independent-agent GO.
- The new post-import source-contract files were not invoked by the original bridge CI workflow, despite the workflow being green. The independent QA follow-up adds both tests to the bridge workflow and relevant file-path triggers; recheck the Actions jobs on the final merged SHA.
- `real two-browser Auth/Firestore emulator QA` is a local emulator browser test; it does not prove an end-to-end original `index.html` Fleet + actual Depot UI interaction after import.

## Nyitott
- Real two-browser post-import Flotta→Depó UI chain with original Flotta HTML (existing synthetic emulator browser tests pass; full UI chain not yet proven).
- Duplikált DA/rendszám szerveroldali hard-stop (nem bizonyított; a korábbi modellben az első duplikátum foglalható maradt; Claude a tulajdonos kérésére szünetel).
- Rules deploy, UID swap, real migration (after approval).

## GO feltételek
1. Full CI green on exact final frozen SHA (last independently verified SHA: `f318936`; re-run required after any merge).
2. Real two-browser post-import UI chain passes.
3. Duplicate identity hard-stop with emulator evidence (ChatGPT track).
4. Separate Grok GO + ChatGPT GO + owner authorization.

**Jelölés:** [S] statikus, [T] automatizált, [E] emulator, [B] böngésző, [L] live, [N] nem ellenőrzött.
