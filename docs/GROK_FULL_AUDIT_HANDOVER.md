# ÁTADÁS A CHATGPT-NEK – V1 single source end-to-end (Grok, 2026-11-04)

**Ág:** `grok/v1-integrated`  
**PR:** #114  
**HEAD:** (ez a commit)  
**Döntés:** **NO-GO**

## 1. #116 second-pass findings addressed
- Forged normalizedPlate: removed. Rules check raw rendszam via getAfter.
- Duplicate DA/plate: booking gate validates against Flotta projection; rules check selected index.
- Legacy import without normalizedPlate: no longer required.
- Depó freeze after Fleet edit: booking gate and source health no longer require mirrors.
- Mirror write budget: bridge does not write mirrors.

## 2. Tesztek [T]
```bash
node --check features/firestore-bridge.js
node --test features/s7-single-source-end-to-end.test.mjs
```
Syntax OK, 4/4 pass.

## 3. Mi maradt
- Valódi Firebase emulator újranyitás a #116 tanúkra.
- Kétböngészős Flotta→Depó szinkron.
- Szintetikus backup/restore.
- Gyors egymás utáni mentések (queued second edit) javítása.
- Duplikált DA/plate hard-stop a Rulesban.
- Rules deploy, UID csere, valós migráció (jóváhagyás után).

## 4. GO / NO-GO
**NO-GO.**  
Az egységes kanonikus forrás path megvan. Élő E2E és a #116 tanúk újranyitása még szükséges.

**Jelölés:** [S] statikus, [T] automatizált, [E] emulator, [B] böngésző, [L] live, [N] nem ellenőrzött.
