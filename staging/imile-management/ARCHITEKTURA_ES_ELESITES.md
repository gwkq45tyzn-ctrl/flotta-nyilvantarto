# iMile Management – közös törzsadatok, két külön modul (STAGING)

**Állapot: fejlesztés alatt; élesítés tiltva.** A `main` ág, a Flotta Nyilvántartó éles `index.html` fájlja és a meglévő Apps Script háttér **változatlan**.

## Modulok és adattulajdonlás

- **Közös törzsadat:** `drivers` (azonosító: DA-kód); `vehicles` (azonosító: normalizált rendszám, később stabil belső ID); `vendors` (vállalkozók); `users` (szerepkörök).
- **Flotta saját adatai:** jármű okmányok, biztosítások, műszaki, szerviz, km-óra, tankolókártyák, átadások, előzmények.
- **DepóKapacitás saját adatai:** napi foglalások, kerület, csomagigény, Attendance, autófotó-linkek, teljesítmény, riportok.
- A közös törzs *egyetlen hiteles, verziózott forrásból* származik; a modulok nem tartanak fenn külön módosítható futár- és autótörzset.

## Biztonságos átállási lépések

1. **Fagyasztott éles flotta:** a jelenlegi alkalmazás és a Google Apps Script tovább működik. Minden átállás előtt exportálható JSON-mentés és független, visszaállítható központi mentés szükséges.
2. **Csak olvasó migráció:** a flotta JSON-adatainak feldolgozása külön staging környezetben, automatikus személyesadat-feltöltés nélkül. Az eredeti adatforráshoz nem írunk.
3. **Azonosító-egyeztetés:** futárnál DA-kód, autónál rendszám normalizálása; hiányzó/ütköző/duplikált azonosítók kézi felülvizsgálata. Nem történik automatikus felülírás.
4. **Központi adatbázis + szerepkörök:** külön, védett Firebase-projekt; minden adat szerveroldali Firestore Rules-védelemmel; külön admin/editor/viewer jogosultságok.
5. **Párhuzamos, csak olvasó kipróbálás:** mindkét felület ugyanazokat a közös törzsadatokat *olvassa*, de éles flottaírás továbbra is a régi rendszeren történik. Stagingben ellenőrizzük a rekordegyezőséget.
6. **Ütközésmentes írás bevezetése:** tranzakciós jármű-foglalás és jogosultságkezelés; nem elég a böngészőoldali ellenőrzés.
7. **Teljes regressziós teszt:** biztosítások, szerviz, tankolókártyák, flottaelőzmények, mentés, szinkron, Attendance és csomag-KPI-k.
8. **Kézi GO/NO-GO:** csak céges jóváhagyás és explicit felhasználói élesítési engedély után lehet a `main` ág felületét módosítani. Ha nem sikeres, az éles flotta a régi háttérrel marad.

## Élesítési kapuk (mind teljesüljön)

- [ ] Az éles Flotta Nyilvántartó minden meglévő funkciója és adata változatlanul működik.
- [ ] A teljes flottaadatbázis mentése és próbavisszaállítása igazolt.
- [ ] Firebase Authentication és Firestore Rules élesben, szerepkörönként ellenőrizve.
- [ ] A migrált futárok, járművek, azonosítók és előzmények egyeznek; duplikációk rendezve.
- [ ] Az autófoglalás párhuzamos szerkesztéskor sem ütközik.
- [ ] Az Attendance szinkron és fotóhozzáférés adatszivárgás nélkül működik.
- [ ] Napi, heti és havi kapacitás- és teljesítményriportok helyesek.
- [ ] Mobilos/asztali próba, biztonsági és adatmegőrzési vizsgálat sikeres.
- [ ] Kifejezett felhasználói engedély a közös rendszer élesítésére.

**Tilos:** a régi flotta Apps Script végpontjának átírása, automatikus adatfelülírás, a nyilvános GitHub Pages-en éles adatok tárolása, staging automatikus élesítése.

## Jelenlegi technikai korlát

A régi Flotta Nyilvántartó egy teljes JSON-pillanatképet szinkronizál Google Apps Script-tel. A DepóKapacitás jelenlegi webkódja Firebase/Firestore-alapú, a `firebase-config.js` még üres. Az igazi közös törzsadat és közös belépés **nem aktív**. Előbb működő Firebase-projekt és adat-migrációs teszt szükséges.


## 2026-10-30 – végrehajtott staging-fejlesztés

- Megjelent az **offline, kizárólag olvasó** flotta JSON-migrációs előnézet:
  `staging/imile-management/migration-preview.html`.
- DA-kód és rendszám normalizálás, státusztérkép, hiányzó / dupla azonosítók, ismeretlen státuszok ellenőrzése: `shared-records.mjs`.
- Automatikus migráció **nincs**: a riportot csak a helyi böngésző dolgozza fel.
- A DepóKapacitás fejlesztői ágán a `drivers` és `vehicles` közös törzsadatok **csak olvashatók**. A kapacitás külön `driverCapacities/{daCode}` dokumentumba kerül.
- A foglalás ezt a külön kapacitást használja; az autó a közös flottaállapotot olvassa.
- A staging Firestore-szabályok a közös törzs szerkesztését adminisztrátorra korlátozzák és a törlést tiltják.
- GitHub Actions staging ellenőrzés `.github/workflows/imile-staging.yml`, `shared-records.test.mjs`.
- **Még nincs éles Firebase adatbázis-jóváhagyás, beállított webkonfiguráció, migrált adat vagy közös belépés.**

### Helyi migrációs próba

1. Az éles Flotta Nyilvántartóban kattints a **JSON biztonsági mentés** gombra, és őrizd meg az eredeti fájlt.
2. Külön, lokális tesztkörnyezetben indíts statikus HTTP-kiszolgálót a staging mappa felett (például `python -m http.server 8080` a repository gyökeréből).
3. Nyisd meg a `http://localhost:8080/staging/imile-management/migration-preview.html` címet.
4. Válaszd ki a korábban mentett flotta JSON-t, nézd meg a problémás rekordokat.
5. A kapott ellenőrzési riportot **ne** töltsd fel nyilvános GitHubra. Személyes adatot tartalmazhat.
6. A migráció csak az ellenőrzés és céges jogosultság után készíthető elő külön admin-műveletként.

### Firebase valódi bekötése – hiányzó hozzáférés

A Firebase-bővítmény telepítettnek látszik, de a jelen ChatGPT-eszközkészlet nem biztosít közvetlen Firebase / Firestore projektműveleteket.
Ezért **semmilyen állítás nem tehető** a Firestore szabályok tényleges publikálásáról, az Auth felhasználókról, az élő adatbázisról vagy a mentésekről.
Kizárólag a staging ágon lehet majd megadni az engedélyezett Firebase-webkonfigurációt. Firestore Rules publikálás, első admin felvétele és Google IAM külön jogosultsági lépések.


## 2026-10-30 – kapacitás és foglalás fejlesztői javítások

A `depokapacitas/capacity-eligibility.mjs` megvizsgálja a futár és jármű közös törzsadatait:

- **Mai/jövőbeli beosztás:** csak `active === true` futár és `status === 'Elérhető'` jármű kapacitása számít bele a tervezett összesenbe.
- **Korábbi nap:** a korábban rögzített napi kapacitás a történeti kimutatás része marad, akkor is, ha a jármű azóta szervizbe került.
- A hibás vagy hiányzó közös törzsrekordhoz tartozó foglalás kapacitása a mai és jövőbeli tervekben nulla.
- Az áttekintés figyelmeztet a kapacitásból kizárt foglalásokra; a foglalási lista külön mutatja az elérhetőséget.
- Foglalás mentésekor a Firebase tranzakció **ismét lekéri** a futárt, az autót és a külön kapacitásrekordot.
- A staging `firestore.rules` fájlban a foglalás új létrehozását **szerveroldali** ellenőrzés is védi az inaktív futárral vagy szervizelt autóval szemben.
- A `capacity-eligibility.test.mjs` a státuszok és a történeti adatok viselkedését teszteli.
- Az új teszt bekerült a staging CI-munkafolyamatba.

**Ellenőrzés:** 16/16 célzott logikai és kódintegritási teszt sikeres a beszélgetésben futtatott mintákon. Az éles Firebase jogosultságok, a GitHub Actions futás és a teljes böngészős integrációs teszt **még nincs igazolva**.

**Élesítési állapot változatlan:** a Firebase webkonfiguráció GitHubon üres, és a jelenlegi éles Flotta Nyilvántartóhoz nem nyúltunk.

## 2026-10-30 – Importdátumok javítása

A DepóKapacitás staging alkalmazás most a `depokapacitas/import-dates.mjs` közös feldolgozót használja. Támogatja az ISO (`2026-10-30`), magyar (`30.10.2026`), amerikai (`10/30/2026`) és Excel-sorszámos dátumokat. A jelenléti import kifejezetten amerikai `MDY` sorrendet használ a kétértelmű perjeles dátumoknál, a többi operatív import alapértelmezésben magyar `DMY` sorrendet. A dátumvalidálás megakadályozza a lehetetlen napok bekerülését. A `depokapacitas/import-dates.test.mjs` automatikus ellenőrzés a staging GitHub Actions része.

Az új dátumkezelés kód- és mintatesztjei sikeresek, de teljes Excel/Google Attendance böngészős integrációs próba és éles Firestore-validálás még szükséges. Az éles Flotta változatlan.


## 2026-10-30 – importbiztonság és Firestore szerveroldali integritás

- Az Excel-beolvasás előzetes ellenőrzése **teljes fájlszintű**: hiányzó kötelező mező, rossz számérték, hibás jelenléti időpont vagy azonos Firestore-rekordra mutató duplikált sor esetén a feltöltés nem indul el.
- A helytelen, negatív vagy nem egész csomagszámok nem alakulnak észrevétlenül nullává.
- A feltöltés megmutatja, hány beolvasott rekord tér el a kliens által ismert központi adatoktól. A hálózati adatfrissítés miatt a változásszám csak tájékoztató jellegű; éles környezetben párhuzamos szerkesztést is vizsgálni kell.
- A több részletből álló Firestore batch-írás részleges sikertelenségét a felület külön jelzi. Ez **nem tranzakciós, az egész fájlra vonatkozó atomicitás**. Teljes atomikus importhoz külön szerveroldali feldolgozási terv szükséges.
- A Google Attendance Apps Script az AM/PM alakú időpontokat validálja, és a tartalék parszolás eredményét időpontként jelöli.
- A Firestore staging szabályok a közös \`drivers\` és \`vehicles\` dokumentumoknál az azonosítók egyezését követelik; új foglalásnál a futár aktív, az autó elérhető, a kapacitás pedig az aktuálisan rögzített referenciaértékkel egyező kell legyen.
- Új automatizált kódszintű tesztek: \`import-validation.test.mjs\`, \`google-sync/timestamp.test.mjs\`, \`rules-contract.test.mjs\`.

**Nem igazolt még:** Firestore Emulator jogosultsági próba, élő Firebase-integráció és jogosultságok publikálása, teljes Excel böngészős kipróbálás, GitHub Actions sikeres futás. A szabályfájl módosítása önmagában nem publikálja a Firestore-szabályokat.

**Kiadási tiltás:** a régi flottarendszer változatlanul üzemel; az új iMile Management átállításához a korábbi GO/NO-GO ellenőrzési lista mindegyik kapuja szükséges.
