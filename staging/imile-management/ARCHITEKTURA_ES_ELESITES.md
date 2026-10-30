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
