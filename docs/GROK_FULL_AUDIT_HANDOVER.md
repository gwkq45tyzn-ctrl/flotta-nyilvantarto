# ÁTADÁS A CHATGPT-NEK – V1 acceptance contract (Grok, 2026-11-04)

**Ág:** `grok/v1-integrated`  
**PR:** #114  
**HEAD:** (ez a commit)  
**Döntés:** **NO-GO**

## 1. Mit tartalmaz
- Unified acceptance contract test: features/v1-acceptance.test.mjs (10/10 pass)
- Release blockers table: docs/V1_RELEASE_BLOCKERS.md
- Capacity from Flotta kapacitas
- Plate normalization for index lookup
- Mirror writes closed after import
- Single canonical Flotta source

## 2. Tesztek [T]
```bash
node --check features/firestore-bridge.js
node --test features/v1-acceptance.test.mjs
```
Syntax OK, 10/10 pass.

## 3. Nyitott blockers
- Rapid second save (expected 200, actual 0)
- normalizedPlate forgery residual (rules cannot prove derivation)
- Duplicate DA/plate hard-stop in rules
- Real Firebase emulator acceptance suite
- Two-browser post-import UI chain
- Synthetic backup/restore SHA parity

## 4. GO / NO-GO
**NO-GO.**  
Az acceptance contract megvan. Élő E2E, a rapid save javítás, a normalizedPlate derivation proof és a teljes CI green még szükséges.

**Jelölés:** [S] statikus, [T] automatizált, [E] emulator, [B] böngésző, [L] live, [N] nem ellenőrzött.
