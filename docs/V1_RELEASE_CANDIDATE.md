# V1 Release Candidate – 2026-11-05

**Ág:** `grok/v1-integrated`  
**PR:** #114  
**HEAD:** `bccb0f5` (integrates #119 at `7dcc7ce`)  
**Döntés:** **NO-GO** (pending full CI green and two-browser post-import UI)

## Integrált változások (#119)
- Rules recompute eligibility from original `rendszam` via `.replace('[[:space:]-]','').upper()`. Forged `normalizedPlate` cannot authorize a different vehicle.
- Capacity fallback reads canonical selected Fleet driver `kapacitas`, not legacy mirror.
- Bridge requires `migrationSourceSha256` to match approved policy (fail-closed).
- SHA validation uses strict hex regex.

## Tesztek [T]
```bash
node --check features/firestore-bridge.js
node --test features/firestore-bridge.runtime-regressions.test.cjs features/v1-acceptance.test.mjs
```
Syntax OK, 14/14 pass.

## Nyitott
- Full CI re-run on this SHA (bridge, staging, restricted Rules emulator).
- Two-browser post-import Flotta→Depó UI chain.
- Synthetic backup/restore SHA parity.
- Claude duplicate DA/plate server-side hard-stop (separate track).
- Rules deploy, UID swap, real migration (after approval).

## GO feltételek
1. Full CI green on this SHA.
2. Two-browser post-import UI chain passes.
3. Synthetic backup/restore SHA parity.
4. Claude independent security review of duplicate identity hard-stop.
5. Separate Grok GO + ChatGPT GO + owner authorization.

**Jelölés:** [S] statikus, [T] automatizált, [E] emulator, [B] böngésző, [L] live, [N] nem ellenőrzött.
