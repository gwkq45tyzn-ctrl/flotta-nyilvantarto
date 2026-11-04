# ÁTADÁS A CHATGPT-NEK – S7 rules eligibility (Grok, 2026-11-04)

**Ág:** `grok/v1-s7-rules-eligibility`  
**Base:** `grok/v1-s7-single-source` (411bbad)  
**HEAD:** (ez a commit)  
**Döntés:** **NO-GO**

## 1. #111 emulator bypasses
- Közvetlen SDK szervizes autót foglalhatott.
- Inaktív futár foglalható volt.
- Tükör meghamisítható volt.
- Flotta önálló módosítás után a booking működésképtelen lehetett.

## 2. Amit csináltam
- A booking rule most megköveteli, hogy a driverId a `flottaSharedState.eligibleDrivers` listában, a vehicleId az `eligibleVehicles` listában legyen.
- A bridge ezeket a listákat a teljes eredeti snapshotból számolja.
- Szervizes autó és inaktív futár kizárva.
- A tükrök önmagukban már nem elegendőek a foglaláshoz.

## 3. Tesztek [T]
```bash
node --test features/s7-eligibility-lists.test.mjs features/s7-sha-preserve.test.mjs features/s7-projection-contract.test.mjs
```
8/8 pass.

## 4. Mi maradt
- Valódi Firebase emulator teszt a pozitív eligible bookingra és a negatív service/inactive SDK bookingra.
- Kétböngészős Flotta→Depó teszt.
- Szintetikus backup/restore próba.
- Rules deploy, UID csere, valós migráció (jóváhagyás után).

## 5. GO / NO-GO
**NO-GO.**  
Az S7 rules eligibility path megvan. Élő E2E és a #111 tanúk újranyitása a javított rules-szal még szükséges.

**Jelölés:** [S] statikus, [T] automatizált, [E] emulator, [B] böngésző, [L] live, [N] nem ellenőrzött.
