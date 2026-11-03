# ÁTADÁS A CHATGPT-NEK – iMile Management V1 (Grok, 2026-11-03)

**Ág:** `grok/original-flotta-firestore-bridge`  
**PR:** https://github.com/gwkq45tyzn-ctrl/flotta-nyilvantarto/pull/72 (Draft)  
**HEAD:** `c8bfd7e` (Bridge v5)

## 1. Teljes projekt állapota
- Eredeti Flotta (`main/index.html`) megőrizve, Firestore-híd v5-tel. [S][T]
- DepóKapacitás és riportok staging ágon fejlettek, még nincsenek egységesítve. [S]
- Egyetlen fiók koncepció kódban jelen van. [S]
- Élő kétböngészős E2E, rules deploy, valós migráció: [N]

## 2. Elkészült fejlesztések (commitok)
- `4fda4af` első híd
- `563dbc9` Auth, dual-sync gate, tranzakció, rules
- `efabc54` v3 dirty, session, full staging rules base
- `2cada4a` QA #73 login-unlock + concurrent requeue
- `d04c294` v4 requeue cap + Auth gate
- `c8bfd7e` v5 pre-import read-only, early script order, conflict stop (PR #75)

## 3. Módosított fájlok (összesített)
- `features/firestore-bridge.js`
- `features/firestore-bridge.test.mjs`
- `features/firestore-bridge.runtime-regressions.test.cjs`
- `features/firestore-bridge.cutover-safety.test.cjs`
- `features/shared-master-adapter.mjs` + test
- `depokapacitas/firestore.rules` (staging base + shared state)
- `index.html` (script order)
- `docs/MIGRATION_RESTORE_PLAN.md`
- `docs/GROK_FULL_AUDIT_HANDOVER.md`

## 4. Tesztek [T]
```bash
node features/firestore-bridge.test.mjs
node --test features/firestore-bridge.runtime-regressions.test.cjs
node --test features/firestore-bridge.cutover-safety.test.cjs
node features/shared-master-adapter.test.mjs
```
Mind sikeres a `c8bfd7e` commiton.

## 5. Nyitott hibák / korlátok
- [N] Élő Firebase rules publikálás és Auth megerősítés.
- [N] Kétböngészős szintetikus E2E.
- [S] 1 MiB dokumentumlimit nagy history esetén.
- [S] Depó és riportok még nincsenek az eredeti Flotta UI-ba integrálva.
- [S] Apps Script végleges leállítása cutover után.

## 6. Modulonként
- **Flotta:** UI + híd v5 kész (read-only pre-import, concurrent save, conflict stop). [T]
- **Depó:** stagingben kész, közös törzs adapter pure függvény elkészült. [S][T]
- **Riportok:** staging pure functionok + spec megvan, UI integráció hiányzik. [S]

## 7. Firebase / Rules
- Rules fájl a staging alapra épül + `flottaSharedState` szigorítás. [S]
- Publikálás: [N] nem történt.

## 8. Valós idejű szinkron
- Tranzakciós revision + requeue + conflict stop kódban. [T]
- Élő kétböngészős: [N]

## 9. Migráció
- Terv: `docs/MIGRATION_RESTORE_PLAN.md`. [S]
- Adapter: `features/shared-master-adapter.mjs` (mezők megőrzése). [T]
- Végrehajtás: [N]

## 10. GO / NO-GO
**NO-GO.**  
Bizonyíték: nincs rules deploy, nincs élő E2E, nincs jóváhagyott migráció.

## 11. Következő munkafázis a ChatGPT-nek
1. Rules publikálás jóváhagyása és ellenőrzése.
2. Szintetikus kétböngészős E2E a `c8bfd7e` hídra.
3. Depó UI bekötése a shared-master-adapterre.
4. Riport modul (In-Hub/OFD) egyszerű navigációs belépő az eredeti Flottából.
5. 1 MiB limit kezelés (split vagy summary) tervezése.

**Jelölés:** [S] statikus, [T] automatizált teszt, [E] emulator, [B] böngésző, [L] live, [N] nem ellenőrzött.
