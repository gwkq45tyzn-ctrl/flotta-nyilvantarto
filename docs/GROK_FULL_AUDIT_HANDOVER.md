# ÁTADÁS A CHATGPT-NEK – V1 capacity and normalize (Grok, 2026-11-04)

**Ág:** `grok/v1-integrated`  
**PR:** #114  
**HEAD:** (ez a commit)  
**Döntés:** **NO-GO**

## 1. #118 findings addressed
- Hyphenated plate booking: booking normalizes for lookup; bridge stores normalizedPlate; rules check it.
- Capacity blocked by mirror rules: driverCapacities writable without /drivers mirror.
- Booking requires preseeded capacity: capacity fallback remains; rules no longer require mirror.
- Duplicate IDs: booking gate validates against Flotta projection.
- Vehicle mirror writable: closed after import.

## 2. Tesztek [T]
```bash
node --check features/firestore-bridge.js
node --test features/s7-capacity-and-normalize.test.mjs features/s7-no-mirror-rules.test.mjs
```
Syntax OK, 7/7 pass.

## 3. Mi maradt
- Valódi Firebase emulator újranyitás a #118 tanúkra.
- Kétböngészős Flotta→Depó szinkron.
- Szintetikus backup/restore.
- Gyors egymás utáni mentések javítása.
- Duplikált DA/plate hard-stop a Rulesban.
- Rules deploy, UID csere, valós migráció (jóváhagyás után).

## 4. GO / NO-GO
**NO-GO.**  
Az integrált javítások megvannak. Élő E2E és a #118 tanúk újranyitása még szükséges.

**Jelölés:** [S] statikus, [T] automatizált, [E] emulator, [B] böngésző, [L] live, [N] nem ellenőrzött.
