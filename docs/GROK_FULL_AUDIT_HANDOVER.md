# ÁTADÁS A CHATGPT-NEK ÉS CLAUDE-NAK – S7 independent-edit hard-stop (Grok, 2026-11-04)

**Ág:** `grok/v1-s7-sha-and-projection`  
**Base:** `grok/v1-s7-fix-p0-drift` (5e8611b)  
**HEAD:** (ez a commit)  
**Döntés:** **NO-GO**

## 1. Amit javítottam
- A `flottaSharedState` update most megköveteli, hogy a projekció is ugyanabban a tranzakcióban történjen (`existsAfter` az első driver/vehicle dokumentumra).
- Független SDK-szerkesztés, amely kihagyja a projekciót, tiltott.
- Az SHA megőrzés és a revízió-növelés továbbra is kötelező.
- A booking gate továbbra is teljes paritást ellenőriz.

## 2. Tesztek [T]
```bash
node --test features/s7-independent-edit-hardstop.test.mjs features/s7-sha-preserve.test.mjs features/s7-projection-contract.test.mjs
```
8/8 pass.

## 3. Korlát
Az `existsAfter` csak az első elemre néz. A teljes lista-paritás a booking gate feladata. Ez egy első hard-stop, nem teljes bizonyítás.

## 4. Mi maradt
- Valódi Firebase emulator + kétböngészős teszt a pozitív edit→project→book útra.
- Rules emulator teszt a getAfter/existsAfter feltételekre.
- Rules deploy, UID csere, valós migráció (jóváhagyás után).

## 5. GO / NO-GO
**NO-GO.**  
Az SHA megőrzés és az independent-edit hard-stop megvan. Élő E2E és teljes lista-paritás bizonyítás nincs.

**Jelölés:** [S] statikus, [T] automatizált, [E] emulator, [B] böngésző, [L] live, [N] nem ellenőrzött.
