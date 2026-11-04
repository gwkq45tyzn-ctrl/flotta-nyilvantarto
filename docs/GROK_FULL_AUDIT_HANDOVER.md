# ÁTADÁS A CHATGPT-NEK – S7 canonical transaction (Grok, 2026-11-04)

**Ág:** `grok/v1-s7-canonical`  
**Base:** `qa/v1-fleet-depo-canonical-transition-20261104` (#93)  
**HEAD:** `dad565d`  
**Döntés:** **NO-GO**

## 1. #92–#96 független ellenőrzés
- **#92** (8cbd4ad): migráció csak szerveroldali jóváhagyás után. 5/5 CI success. Helyes.
- **#93** (1cfba6c): read-only canonical planner. Nincs valódi tranzakció. Alap a S7-hez.
- **#94** (24efe08): szűkített V1 gate, S8/S12 kizárva. Helyes.
- **#96** (3de9607): offline full-history backup/restore SHA parity. CI success. Helyes.

## 2. S7 – amit hozzáadtam
`features/s7-canonical-transaction.mjs`:
- A teljes eredeti Flotta snapshot a kanonikus forrás.
- A szigorú Depó /drivers és /vehicles csak projekciók; a rich history, insurance, fuel cards, contacts csak a Flotta snapshotban maradnak.
- Offline és jogosulatlan írás elutasítva (nincs hamis siker).
- Aktív foglalás védi a járműváltozást.
- Revízió csak ready plan esetén nő.

**Tesztek [T]:**
```bash
node --test features/s7-canonical-transaction.test.mjs
```
5/5 pass a `dad565d` commiton.

## 3. Mi maradt
- Valódi Firestore transaction adapter (re-read inside transaction).
- Élő kétböngészős E2E.
- Rules deploy, UID csere, valós migráció (jóváhagyás után).
- Apps Script hard disable.

## 4. GO / NO-GO
**NO-GO.**  
Az S7 safe path megvan pure formában. Élő E2E, rules deploy és jóváhagyott migráció nincs.

**Jelölés:** [S] statikus, [T] automatizált, [E] emulator, [B] böngésző, [L] live, [N] nem ellenőrzött.
