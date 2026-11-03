# ÁTADÁS A CHATGPT-NEK – iMile Management V1 (Grok, 2026-11-03 20:37+)

**Ág:** `grok/original-flotta-firestore-bridge`  
**PR:** https://github.com/gwkq45tyzn-ctrl/flotta-nyilvantarto/pull/72 (Draft)  
**HEAD:** `87a700c`

## 1. Teljes projekt állapota
- Eredeti Flotta + Firestore-híd v5 + pre-import védelem. [S][T]
- PR #76 shared master schema integrálva. [T]
- Depó/riportok stagingen, UI integráció még hiányzik. [S]
- Élő E2E / rules deploy / valós migráció: [N]

## 2. Elkészült fejlesztések (legutóbbi)
- `c8bfd7e` Bridge v5 (pre-import read-only, early script, conflict stop)
- `ba10205` első adapter + migration plan + handover
- `87a700c` #76 exact-schema adapter + kritikus pre-import applyRemote gate

## 3. Módosított fájlok (87a700c)
- `features/firestore-bridge.js` (applyRemote gated by isPrimary)
- `features/firestore-bridge.preimport-protect.test.cjs` (új)
- `features/shared-master-adapter.mjs` (#76 verzió)
- `features/shared-master-adapter.test.mjs`
- `docs/SHARED_MASTER_INTEGRATION_CONTRACT.md`

## 4. Tesztek [T]
```bash
node features/shared-master-adapter.test.mjs
node --test features/firestore-bridge.preimport-protect.test.cjs
node --test features/firestore-bridge.cutover-safety.test.cjs
node --test features/firestore-bridge.runtime-regressions.test.cjs
node features/firestore-bridge.test.mjs
```
Mind sikeres a `87a700c` commiton.

## 5. Nyitott
- [N] Élő rules publikálás, kétböngészős E2E, jóváhagyott migráció.
- [S] Depó UI + riportok + egységes navigáció még nincs az eredeti Flotta oldalán.
- [S] 1 MiB limit kezelés.

## 6. Modulok
- **Flotta híd:** pre-import read-only + no remote overwrite. [T]
- **Közös törzs:** exact schema adapter kész, írásoknál a flotta sidecar kihagyandó. [T]
- **Depó / Riportok:** staging pure functionok megvannak, UI hiányzik. [S]

## 7. Firebase / Rules
- Rules fájl staging alap + shared state. [S]
- Publikálás: [N]

## 8. Valós idejű szinkron
- Tranzakció + requeue + conflict stop + pre-import gate. [T]
- Élő kétböngészős: [N]

## 9. Migráció
- Terv + exact adapter megvan. [S][T]
- Végrehajtás: [N]
- `flottaMarkImportVerified()` önmagában nem elég; explicit ellenőrzött import szükséges.

## 10. GO / NO-GO
**NO-GO.**  
Nincs rules deploy, nincs élő E2E, nincs jóváhagyott adatmigráció.

## 11. Következő a ChatGPT-nek
1. Rules jóváhagyás + publikálás.
2. Szintetikus kétböngészős E2E a `87a700c` hídra.
3. Depó UI bekötése a shared-master-adapterre (sidecar nélkül írva).
4. In-Hub / OFD riport egyszerű belépő az eredeti Flottából.
5. Egységes navigáció + Auth session.

**Jelölés:** [S] statikus, [T] automatizált, [E] emulator, [B] böngésző, [L] live, [N] nem ellenőrzött.
