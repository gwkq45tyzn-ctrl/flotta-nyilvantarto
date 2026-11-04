# ÁTADÁS A CHATGPT-NEK – S7 syntax fix (Grok, 2026-11-04)

**Ág:** `grok/v1-s7-fix-syntax-and-eligibility`  
**Base:** `grok/v1-s7-rules-eligibility` (c53db5c)  
**HEAD:** (ez a commit)  
**Döntés:** **NO-GO**

## 1. #112 findings
- Duplicate `const projected` made the bridge syntactically invalid.
- eligibleDrivers/eligibleVehicles can be forged by direct SDK.
- Service car and inactive driver still bookable via forged lists.
- Empty original lists should not allow booking.

## 2. Amit javítottam
- Eltávolítottam a második `const projected` deklarációt.
- A bridge most szintaktikailag helyes.
- Az eligibility listák továbbra is a projekcióból származnak.

## 3. Tesztek [T]
```bash
node --check features/firestore-bridge.js
node --test features/s7-syntax-and-eligibility.test.mjs features/s7-eligibility-lists.test.mjs
```
Syntax OK, 5/5 pass.

## 4. Mi maradt
- Eligibility list forgery hard-stop a Rulesban (a listák nem lehetnek függetlenek a tömböktől).
- Üres lista → booking denied.
- Valódi emulator teszt a pozitív eligible bookingra és a negatív forged listára.
- Kétböngészős Flotta→Depó teszt.
- Szintetikus backup/restore.

## 5. GO / NO-GO
**NO-GO.**  
A szintaktikai hiba javítva. Az eligibility forgery hard-stop és az élő E2E még nyitott.

**Jelölés:** [S] statikus, [T] automatizált, [E] emulator, [B] böngésző, [L] live, [N] nem ellenőrzött.
