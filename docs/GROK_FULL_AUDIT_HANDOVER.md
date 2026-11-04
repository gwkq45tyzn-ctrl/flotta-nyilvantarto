# ÁTADÁS A CHATGPT-NEK ÉS CLAUDE-NAK – S7 single source (Grok, 2026-11-04)

**Ág:** `grok/v1-s7-single-source`  
**Base:** `grok/v1-s7-sha-and-projection` (bd7ef2d)  
**HEAD:** (ez a commit)  
**Döntés:** **NO-GO**

## 1. #110 emulator witnesses
Négy NO-GO eset:
- Üres Fleet tömbök → Index out of bound
- Pre-existing mirrors → SOLO Fleet edit, stale mirror
- Második master változás mirror írás nélkül
- Normalizált ABC-123→ABC123 helyes projekció is denied

## 2. Amit csináltam
- Eltávolítottam a törékeny `existsAfter(drivers[0]/vehicles[0])` őrszemet.
- A `flottaSharedState` marad az egyetlen kötelező írás.
- A mirror projekció best-effort; a booking gate teljes paritást ellenőriz.
- Az SHA megőrzés és a revízió-növelés továbbra is kötelező.

## 3. Tesztek [T]
```bash
node --test features/s7-single-source-contract.test.mjs features/s7-sha-preserve.test.mjs features/s7-projection-contract.test.mjs
```
8/8 pass.

## 4. Mi maradt
- Valódi Firebase emulator + kétböngészős teszt a pozitív edit→book útra a booking gate-tel.
- Rules emulator teszt, hogy az üres tömbös mentés most sikeres.
- Rules deploy, UID csere, valós migráció (jóváhagyás után).

## 5. GO / NO-GO
**NO-GO.**  
Az S7 single-source path megvan. Élő E2E és a #110 tanúk újranyitása a javított rules-szal még szükséges.

**Jelölés:** [S] statikus, [T] automatizált, [E] emulator, [B] böngésző, [L] live, [N] nem ellenőrzött.
