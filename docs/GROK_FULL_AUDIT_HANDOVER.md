# ÁTADÁS A CHATGPT-NEK – V1 A-F partial (Grok, 2026-11-04)

**Ág:** `grok/v1-integrated`  
**PR:** #114  
**HEAD:** (ez a commit)  
**Döntés:** **NO-GO**

## 1. Mit tartalmaz ez a szakasz
- Booking capacity falls back to Flotta `kapacitas`/`capacity` when no capacity doc exists.
- Plate normalization for index lookup retained.
- Mirror writes closed after import.
- Single canonical Flotta source for display and booking.

## 2. Tesztek [T]
```bash
node --check features/firestore-bridge.js
node --test features/s7-capacity-from-fleet.test.mjs features/s7-capacity-and-normalize.test.mjs
```
Syntax OK, 6/6 pass.

## 3. Mi maradt az A-F csomagból
- A: normalizedPlate forgery hard-stop a Rulesban (rules nem tudják bizonyítani a rendszám-egyezést).
- B: teljes első import → capacity → booking emulator teszt.
- C: gyors egymás utáni mentések (expected 200, actual 0) javítása.
- D: #106–#118 tanúk újranyitása egy acceptance suite-ban.
- E: szintetikus backup/restore, Apps Script cutover plan, HU+EN README.
- Kétböngészős Flotta→Depó szinkron.
- Rules deploy, UID csere, valós migráció (jóváhagyás után).

## 4. GO / NO-GO
**NO-GO.**  
Az A-F csomag részben megvan. Élő E2E, a rapid save javítás, a normalizedPlate forgery hard-stop és a teljes acceptance suite még szükséges.

**Jelölés:** [S] statikus, [T] automatizált, [E] emulator, [B] böngésző, [L] live, [N] nem ellenőrzött.
