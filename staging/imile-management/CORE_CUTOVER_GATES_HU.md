# iMile Management – core rendszer biztonságos használatba vétele

Állapot: 2026-10-31, kizárólag staging fejlesztés, **nem adatimport és nem production-release**.

## Bizonyított állapot

A `staging/imile-management-integration` ág `758136563d3ae841d6cbf776682ca8bc5d3ff3f9` verziója és a 2026-10-31-i Work böngészős staging QA alapján a következő alapműveletek működtek szintetikus Firestore-adatokkal:

- Közös bejelentkezés és modulváltás.
- Közös autó- és futártörzs, autókiadás és visszavétel, kilométeróra-monotonitás és dátumsorrend.
- Szerviz, biztosítás, telefon, tankolókártya, kapcsolatok, állapotváltozások.
- Depó foglalások, ütközésellenőrzés, futár-/autókapacitás és kerületi igény.
- A szabad autó darabszám a kézi kiadás és Attendance-folyamat nyitott használatát is figyelembe veszi.

QA URL: https://imile-management-staging--imile-qa-op4483vh.web.app/staging/imile-management/index.html

A preview **2026-11-07 19:23:21 Europe/Budapest** időpontban lejár. Ez NEM hosszú távon használható állandó belépési pont.

## Miért tilos automatikusan bemásolni a régi Flotta-adatokat?

A GitHub `main/index.html` korábbi Flotta (v18) alkalmazása:
- A `vehicles`, `fuelCards`, `drivers`, `contacts` adatcsoportokat tartja nyilván.
- A járművek tartalmazhatnak részletes biztosítási, km, szerviz-, bérleti és lejárati mezőket, történeti `history` eseményeket és `currentDriver` hozzárendelést.
- A futárok egyéni kapcsolati/okmányadatokat és `history` eseményeket tárolhatnak.
- Google Apps Script központi `baseVersion` verzióegyeztetést és helyi `flotta_nyilvantarto_v16`, `flotta_pending_v16`, `flotta_version_v16` böngészős állapotot is használ.
- Az exportfájl a pillanatnyi helyi állapotot mutatja; **önmagában nem bizonyítja** a legfrissebb központi verziót, sőt lehet feldolgozatlan helyi mentés.

Az új Firestore rendszerben az autó- és futártörzs csak egy része az adattérnek. A jelenlegi `planSharedMasterMigration` kizárólag az `drivers` és `vehicles` közös törzsek létrehozását/egyezését tervezi, nem migrál automatikusan kártyát, kapcsolatot, járműszerviz-adatlapot, okmányt vagy a régi kiosztási előzményeket.

## Új, helyi read-only cutover preflight

A `core-cutover-preflight.mjs` a régi Fleet JSON és egy külön, ellenőrzött staging export alapján kiszámítja a közös törzsadat-eltéréseket **és** megjelöli az át nem vett kártyákat, kapcsolatokat, történeti eseményeket, kitöltött okmány/szerviz mezőket és aktív régi kiadásokat.

Eredmény: csak darabszámok és hibakategóriák, nincs futárnév, rendszám, DA-kód, cím vagy nyers fájl a visszaadott jelentésben. Az elemzés nem végez írást és a szolgáltatói forrást nem hitelesíti. A `review-ready-not-approved` jelzés sem engedélyez automatikus migrációt.

## Élesítés kapui – az értelmes sorrend

1. **Forráskonzisztencia:** régi Fleet központi Apps Script verzió, helyi pending státusz és az esetleges konfliktusok ellenőrzése az eredeti jogosult fiókból. Egy időpontra rögzített, változatlan JSON-mentés és központi verzió bizonyítása.
2. **Teljes biztonsági mentés:** régi központi adatok és az új Firestore adatbázis visszaállítható mentése, külön helyen ellenőrizve. A Firebase Rules/Hosting konfiguráció mentése **nem helyettesíti** az adatbázis-mentést.
3. **Hiányzó üzleti rekordok leltára:** `vehicles`, `drivers`, `fuelCards`, `contacts`, jármű/futár `history`, biztosítás/szerviz, aktív kiadások. Az adatgazda dönt a pontos megfeleltetésről; az audit/történet nem veszhet el.
4. **Felhasználók:** belső admin/editor/viewer személyhez kötött jogosultság, közös jelszó mellőzése, admin és egy másik külön felhasználóval végzett felhős elfogadási próba.
5. **Tartós Hosting:** külön iMile Management staging/prod projekt, a meglévő éles Flotta-címet felülírás nélkül. Csatornát és költséget felhatalmazott Work-környezetben kell ellenőrizni. A jelenlegi QA link 7 nap után megszűnik.
6. **Átállás:** külön, felülvizsgált író migráció, tranzakciós és idempotens próba az elkülönített környezetben, darabszám és történeti egyezés, visszaállítás tesztje, majd kifejezett élesítési jóváhagyás.
7. **Működtetés:** üzemeltető, hiba-/backup-eljárás, sürgős visszaállítás, szerepkörkezelés és céges adatkezelési engedély. Attendance automatikus kézbesítés/kiadás nem kapcsolható be, amíg a hiteles km/dátum forrás hiányzik.

## Szándékosan nem része

- Riport/statisztika továbbfejlesztés.
- Publikált Firebase-módosítás, éles Flotta, Google Sheet vagy Apps Script írás.
- Nyers üzleti adatok, jelszavak, service account adatok tárolása a repositoryban.
- Díjköteles szolgáltatás aktiválása.

**Feladat a Workben:** a jogosult, korábban hitelesített böngészőből csak olvasva ellenőrizd a régi központi verzió/pending státuszt, exportáld a mentést privát helyi tárhelyre, ellenőrizd a külön staging adatbázis és a Hosting jelenlegi állapotát, majd futtasd a read-only előellenőrzést. Az adatok átmásolása nem része az automatikus folytatásnak.
