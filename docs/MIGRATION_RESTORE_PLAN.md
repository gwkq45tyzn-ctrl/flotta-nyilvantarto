# Flotta → Firestore migráció és visszaállítás – jóváhagyás előtti terv

**Állapot: NO-GO, végrehajtás még NEM engedélyezett.** Az alábbiak kizárólag előkészítő lépések, a kód jelenlegi állapotában **ne** végezz éles importot vagy Firebase Rules publikálást.

## 1. Forrásadatok és teljes mentés

- Az eredeti Flotta `index.html` aktuális, szerverrel szinkronizált JSON exportja, az esetleges helyi `flotta_pending_v16` és `flotta_nyilvantarto_v16` állapot, valamint a korábbi Apps Script forrásverzió **külön** rögzítendő.
- A négy top-level tömb: `vehicles`, `drivers`, `fuelCards`, `contacts`. A jármű/futár history, minden extra dokumentummező, aktív használat, biztosítás/szerviz és kapcsolattartó megőrzendő.
- A mentés **privát**, nem kerülhet a nyilvános GitHubra vagy chatbe. Visszaállítási próba nélkül nincs átállás.
- Ha a több helyi példány, pending mentések vagy a régi Apps Script szerverváltozata eltér, explicit konfliktusjegyzék és kézi jóváhagyás szükséges. **A legfrissebb localStorage nem automatikusan a forrásigazság.**

## 2. Szintetikus előellenőrzés

- Csak szintetikus másolaton ellenőrizd a JSON sémát, mezőszámokat, történelemrekordokat, az egyedi rendszámot és az üzleti `daCode`-ot.
- `features/shared-master-adapter.mjs`: `planSharedMigration(snapshot)` csak akkor adjon írási tervet, ha `ready === true` és nincs `issues`.
- `/drivers` és `/vehicles` kanonikus Firestore rekordjai **csak** a szigorú Rules által engedett mezőket tartalmazhatják. A `flotta` részletes sidecar NEM másolható ezekbe a dokumentumokba; a Flotta teljes history a megfelelő külön backup/adatmodell része.
- Ellenőrizd az 1 MiB-os Firestore-dokumentumlimitet és a teljes JSON értékek méretét. A mérési és adatfelosztási terv még hiányzik.

## 3. Biztonságos átállás előfeltételei (NINCSENEK TELJESÍTVE)

1. A teljes, **ténylegesen érvényes** felhős Firestore Rules beolvasása, az aktív feature staging szabályokkal való konfliktusmentes összevezetése és emulátoros *pozitív és negatív* jogosultsági tesztje.
2. Kizárólag az egyetlen engedélyezett, szerveroldalon rögzített Firebase UID és érvényes adminprofil hozzáférése. Az email- vagy böngésző-string ellenőrzés önmagában nem elég.
3. Visszaigazolt, szerveroldali migrációs manifest/jóváhagyás (teljes forrásverzió + egyezőségi hash + rekord/história számok + ellenőrzött backup + rollback lehetőség). Az első Firestore-írás nem történhet meg automatikusan.
4. Két egyidejű valós böngészős *szintetikus* teszt: első belépés, no-write preimport, távoli frissítés, párhuzamos szerkesztés, konfliktus, offline, jogosultságvesztés.
5. Külön felhasználói döntés az éles átállásról és a tényleges céges adatkezelési/jogosultsági megfelelésről.

## 4. A jelenlegi `flottaMarkImportVerified()` **nem hiteles igazolás**

Az aktuális híd egy **hardkódolt** `'verified-import'` szöveget és böngésző `localStorage` jelzőket vizsgál. Ez tesztsegéd, **nem titok és nem adatbiztonsági bizonyíték**: a klienskódot futtató felhasználó tetszőlegesen beállíthatja. A Firebase Security Rules nem a böngészős tokenre alapoz.

**Ne használd éles migrációhoz** az `flottaMarkImportVerified('verified-import')` meghívást, és ne bízz meg a puszta `primary` flagben. A dokumentáció korábbi egyszerű „JSON export → token → első írás” folyamata biztonságos átállásnak **nem elfogadható**.

## 5. Rollback és üzemeltetés

A visszaállítás alapja egy hitelesített, teljes, privát JSON/Apps Script mentés és a Firestore-szerveradatok ellenőrzött verziója. A dokumentum törlése vagy felülírása konzolból **nem** automatikus helyes rollback; előbb meg kell őrizni a revíziót, a kapcsolódó Depó-mesteradatokat és az üzleti foglalásokat.

Rögzítendő az Apps Script kettős sync végleges letiltásának ideje, a visszaállítási felelős, a közös fiók jelszócsere/visszavonás terve és a Spark kvóta/hiba kezelése.

**Utolsó független review:** a Grok `c46848d` átadása szerint a v1 továbbra is NO-GO: nincs élő Rules/2-browser E2E, sem jóváhagyott migráció, és az admin Flotta/Depó/riport shell nincs integrálva.
