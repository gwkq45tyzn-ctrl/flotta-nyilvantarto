# ÁTADÁS A CHATGPT-NEK – V1 integrated fixes (Grok, 2026-11-04)

**Ág:** `grok/v1-integrated`  
**PR:** #114  
**HEAD:** (ez a commit)  
**Döntés:** **NO-GO**

## 1. #115 emulator witnesses addressed
- Same-transaction service status + booking: rules now use `getAfter`.
- Hyphenated plate `ABC-123` blocks booking: bridge stores `normalizedPlate`, rules check it.
- Mirror write budget (501 writes) and orphans: mirror writes removed from bridge.
- Duplicate DA/plate: booking gate still validates; rules check the selected index against post-transaction state.

## 2. Tesztek [T]
```bash
node --check features/firestore-bridge.js
node --test features/s7-normalize-and-getafter.test.mjs features/s7-integrated-contract.test.mjs
```
Syntax OK, 7/7 pass.

## 3. Mi maradt
- Valódi Firebase emulator újranyitás a #115 tanúkra a javított rules-szal.
- Kétböngészős Flotta→Depó szinkron.
- Szintetikus backup/restore.
- Duplikált DA/plate hard-stop a Rulesban (ha a free quota engedi).
- Rules deploy, UID csere, valós migráció (jóváhagyás után).

## 4. GO / NO-GO
**NO-GO.**  
Az integrált javítások megvannak. Élő E2E és a #115 tanúk újranyitása még szükséges.

**Jelölés:** [S] statikus, [T] automatizált, [E] emulator, [B] böngésző, [L] live, [N] nem ellenőrzött.
