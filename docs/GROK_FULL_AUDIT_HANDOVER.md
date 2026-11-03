# ÁTADÁS A CHATGPT-NEK – Független Grok V1 release audit (2026-11-03)

**Auditor:** Grok (független)  
**Candidate SHA (integration):** `a74edec` (integration/imile-v1-unified-20261103)  
**Grok security branch HEAD:** `e450017` (grok/v1-security-migration-20261103)  
**PR-ek:** #79 (integráció), #81 (Grok rules/migration), #82 (ChatGPT nested-hash + emulator CI)  
**Döntés:** **NO-GO**

## S1 – Azonos fagyasztott SHA, artifact, Rules hash, modulscope, Flotta paritás
- [S] Integration HEAD `a74edec` létezik, tartalmazza a dual-signoff dokumentumot és a release gate sablont.
- [S] Eredeti `index.html` Flotta megőrizve a #79-ben.
- [N] Nincs fagyasztott, mindkét auditor által azonosított release artifact SHA-256 + Rules SHA-256 pár.
- **NO-GO.** Nincs közös, fagyasztott candidate csomag.

## S2 – Közös Firebase Auth és egyetlen belső UID
- [S] Integration rules: `member()` bármely aktív admin/editor/viewer-t enged. Nincs hard single-UID kényszer a belső collectionökön.
- [S] Grok #81 rules: `flottaSharedState` email + `REPLACE_WITH_REAL_SHARED_UID` placeholder. A többi collection továbbra is `member()`.
- [S] Courier/photo/vehicleSessions útvonalak a feature rulesben jelen vannak (Grok ág).
- **NO-GO.** Egyetlen UID nincs minden releváns collectionön kikényszerítve.

## S3 – Rules-emulátor pozitív/negatív
- [S] #82 állítása szerint emulatoros UID-tesztek futottak, de a teljes staging suite Attendance mezőknél FAIL.
- [N] Ebben a környezetben firebase-tools nincs; saját emulator futtatás nem történt.
- **NO-GO.** Nincs regressziómentes, teljes emulatoros bizonyíték.

## S4 – Migráció, backup, 1 MiB, dry-run, rollback
- [S] Migrációs manifest létezik (Grok ág). Browser string token nem jóváhagyás.
- [N] Nincs privát teljes Flotta backup + Apps Script szerverváltozat ellenőrzése.
- [N] Nincs hiteles 1 MiB mérés nagy history-n.
- [N] Nincs server-verified import vagy rollback végrehajtás.
- **NO-GO.**

## S5 – Két valódi böngészős multi-PC Firestore
- [T] Szintetikus VM tesztek léteznek (two-browser synthetic).
- [N] Nincs élő kétböngészős teszt a staging Firebase-en (conflict, offline, revoked role).
- **NO-GO.**

## S6 – Eredeti Flotta teljes funkcionalitás és Apps Script hard stop
- [S][T] Bridge pre-import read-only, concurrent requeue, conflict stop, migration token – contract tesztek zöldek az integration checkouton.
- [S] Apps Script csak gated, hard disable cutover után nincs.
- **NO-GO** a hard stop és az élő cutover hiányában.

## S7 – Depó canonical közös törzs és tranzakciók
- [S] Shared master adapter exact-schema (#76) beépítve, sidecar a tervben marad.
- [S] #79-ben a Depó nézet read-only projekció; authoritative write path nincs élesítve.
- **NO-GO.**

## S8 – In-Hub / OFD riportok
- [S] Staging riport pure functionok és spec megvan. OFD azonos kulcs szándékos összeadás dokumentált.
- [N] Nincs pixel/Excel 1:1 összehasonlítás valós mintákkal ebben az auditban.
- **NO-GO** a teljes vizuális/üzemi egyezőség bizonyítékának hiányában.

## S9 – Teljes desktop browser E2E
- [N] Nincs végigvitt böngészős E2E (login → Flotta edit → Depó → riport → logout) két gépen.
- **NO-GO.**

## S10 – 0 Ft Spark, adatvédelem, backup
- [S] Nincs Blaze, nincs fizetős szolgáltatás javasolva.
- [N] Nincs üzemeltetési monitoring, privát backup+rollback végrehajtva.
- **NO-GO** a hiányzó backup/rollback bizonyíték miatt.

## S11 – CI zöld ugyanazon SHA-n
- [S] #79 korábbi runok SUCCESS (14e0ff7 körül).
- [S] #82 teljes staging integration FAIL (Attendance).
- [N] Az aktuális `a74edec` SHA-ra nincs mindhárom (Flotta/Depó/staging) zöld run megerősítve ebben az auditban.
- **NO-GO.**

## S12 – Jövőbeli courier/Attendance/fotó nem aktiválódik
- [S] Feature rules tartalmazza a courier/photo/vehicleSessions útvonalakat (Grok ág).
- [S] Nincs külön V1-gate, ami ezeket hard disable-olja az éles rulesben.
- **NO-GO.** V1-ben ezek nem kapcsolhatók be jóváhagyás nélkül.

## Összesített döntés
**GROK: NO-GO**

**Blokkolók:**
1. Nincs fagyasztott, mindkét auditor által azonosított release candidate SHA + artifact/Rules hash.
2. Single-UID nincs minden belső collectionön kikényszerítve; placeholder UID; courier feature útvonalak jelen vannak.
3. #82 staging CI Attendance FAIL.
4. Nincs élő kétböngészős E2E.
5. Nincs server-verified migráció, privát backup, 1 MiB mérés, rollback.
6. Apps Script nincs hard stop.
7. Depó authoritative write path nincs élesítve.

**Következő konkrét feladatok a ChatGPT-nek:**
1. Fagyasszátok le a candidate SHA-t és számoljatok artifact + Rules SHA-256-ot.
2. Cseréljétek a UID placeholder-t a valódi UID-re (jóváhagyás után) és zárjátok a belső collectionöket single-UID-re.
3. Javítsátok az Attendance rules regressziót (#82).
4. Futtassátok a teljes emulator suite-ot és a kétböngészős szintetikus E2E-t.
5. Készítsétek elő a privát backup + dry-run + rollback tervet.

**Jelölés:** [S] statikus, [T] automatizált, [E] emulator, [B] böngésző, [L] live, [N] nem ellenőrzött.

**Felhasználói élesítési engedély:** nincs megadva. Bármely NO-GO = RELEASE STOP.

## Frissítés (bb311d2)
- `depokapacitas/firestore-v1-restricted.rules` hozzáadva (courier/photo útvonalak deferred).
- Offline canonical JSON size check (`features/migration-size-check.test.mjs`) – szintetikus adat < 1 MiB.
- Továbbra is **NO-GO**: nincs élő E2E, nincs rules deploy, nincs server-verified migráció, nincs Attendance CI javítás.

## Frissítés (c9b90e9)
- Offline migrációs dry-run: `features/migration-dry-run.mjs` (hash + counts + 1 MiB warning, nincs írás).
- V1-restricted rules contract teszt: single-UID placeholder + catch-all deny.
- Apps Script hard-stop terv: `docs/APPS_SCRIPT_HARD_STOP.md` (gated megvan, hard disable nincs).
- Továbbra is **NO-GO**.
