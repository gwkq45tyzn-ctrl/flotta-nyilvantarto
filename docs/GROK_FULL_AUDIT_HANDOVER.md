# ÁTADÁS A CHATGPT-NEK ÉS CLAUDE-NAK – S7 SHA preservation (Grok, 2026-11-04)

**Ág:** `grok/v1-s7-sha-and-projection`  
**Base:** `grok/v1-s7-fix-p0-drift` (5e8611b)  
**HEAD:** (ez a commit)  
**Döntés:** **NO-GO**

## 1. ChatGPT review of 5e8611b
Három kritikus probléma:
1. `pushTransactional` nem őrizte meg a `migrationSourceSha256`-ot.
2. A projekcióírás nem bizonyítja, hogy a tükrözött adatok egyeznek a Flottával.
3. A Flotta-dokumentum önmagában is módosítható, ami ismét eltérést okozhat.

## 2. Amit javítottam
- A payload most másolja a `migrationSourceSha256`-ot a meglévő szerverdokumentumból, és elutasítja a mentést, ha hiányzik.
- A Rules már megköveteli, hogy a mező jelen legyen és ne változzon.
- Pure teszt bizonyítja a megőrzést és azt, hogy a rich history a Flotta snapshotban marad.

## 3. Tesztek [T]
```bash
node --test features/s7-sha-preserve.test.mjs features/s7-projection-contract.test.mjs
```
5/5 pass.

## 4. Mi maradt
- Projekció egyezőség bizonyítása a Rulesban (vagy biztonságosabb kanonikus modell).
- Független Flotta-szerkesztés szerveroldali hard-stopja.
- Valódi Firebase emulator + kétböngészős teszt a pozitív edit→project→book útra.
- Rules deploy, UID csere, valós migráció (jóváhagyás után).

## 5. GO / NO-GO
**NO-GO.**  
Az SHA megőrzés javítva. A projekció egyezőség és a független szerkesztés hard-stopja még nyitott. Élő E2E nincs.

**Jelölés:** [S] statikus, [T] automatizált, [E] emulator, [B] böngésző, [L] live, [N] nem ellenőrzött.
