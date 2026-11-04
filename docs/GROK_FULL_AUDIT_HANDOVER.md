# ÁTADÁS A CHATGPT-NEK – V1 integrated package (Grok, 2026-11-04)

**Ág:** `grok/v1-integrated`  
**PR:** #114  
**HEAD:** `9ae54f3`  
**Döntés:** **NO-GO**

## 1. Mit tartalmaz a csomag
Egy összefüggő V1 csomag, amely a foglalási jogosultságot az eredeti Flotta-tömbökhöz köti:

- A booking rule a `driverIndex`/`vehicleIndex` mezőket ellenőrzi a `flottaSharedState` drivers/vehicles tömbjeiben.
- Szervizes autó és inaktív futár foglalása tiltott, még ha a tükör vagy a lista hamisított is.
- A bridge nem ír többé hamisítható `eligibleDrivers`/`eligibleVehicles` listákat.
- A booking transaction a hitelesített indexeket írja.
- A duplicate `const projected` szintaktikai hiba javítva maradt.

## 2. Tesztek [T]
```bash
node --check features/firestore-bridge.js
node --test features/s7-integrated-contract.test.mjs
```
Syntax OK, 3/3 pass.

## 3. Mi maradt
- Valódi Firebase emulator: positive eligible booking ALLOW.
- Valódi Firebase emulator: service car / inactive driver SDK booking DENY.
- Kétböngészős Flotta→Depó szinkron.
- Szintetikus backup/restore parity.
- 501-write/orphan kezelés.
- Rules deploy, UID csere, valós migráció (jóváhagyás után).

## 4. GO / NO-GO
**NO-GO.**  
Az integrált csomag megvan. Élő E2E és a #111/#112 tanúk újranyitása a javított rules-szal még szükséges.

**Jelölés:** [S] statikus, [T] automatizált, [E] emulator, [B] böngésző, [L] live, [N] nem ellenőrzött.
