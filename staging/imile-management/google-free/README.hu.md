# iMile – díjmentes Google Sheets híd / 1. fejlesztési lépés

**Állapot: kizárólag forráskód és helyi, szintetikus QA. Nincs telepítés, Google-fájl megnyitás, megosztás, valós adatírás vagy automatizált szinkron.**

Alap: PR #63, pontos commit e6933bb05103368d31de8b62097d15809fb3310f. A korábbi Firestore/Attendance/Flotta/DepóKapacitás rendszerek változatlanok. A Google-híd **nem párhuzamos üzemi Attendance** és nem a server-verifier helyettesítője.

## Mi működik a szintetikus kódprototípusban?

A Google Apps Script egy **saját, új teszt-táblázathoz kötött szkriptként** használható.
A táblázat egyetlen, elkülönített IMILE_DEMO_CAPACITY_V1 fülét olvassa/írja.
A Sidebar.html a Google Sheets menüjéből nyíló tesztpanel: nap, kerületi igény
(új és retry), tervezett és megerősített **kézi** kapacitás, JSON-export.

- Naponként egy revíziózott snapshot; LockService.getScriptLock() sorosítja az írásokat.
- A kliens minden mentésnél elvárt revíziót és 128 bites műveletazonosítót ad.
  Elavult revízió REVISION_CONFLICT, ugyanazon művelet ugyanazzal a tartalommal
  idempotens. A szerver nem fogad tetszőleges kollekció- vagy fájlnevet.
- Hiányzó nap **ismeretlen** (nem automatikus nulla csomag); duplikált nap,
  hibás séma, sérült JSON, képlet-injektáló kerület, negatív érték fail-closed.
- Max. 30 kerület/nap, max. 365 nap, JSON a Google Sheet cella méretén belül.
- A exportDemoDemand a meglévő DepóKapacitás demands adatmodelljéhez
  illeszkedő, **nem hitelesített** aggregált tesztadatot állít elő. Nem olvassa
  a régi Google Attendance-et vagy a VEHICLE_Fuel_Database-t.
- A jelenlegi modell **nem** különbözteti meg tracking ID-nként az új és
  ismételt kézbesítést. A kézi aggregátumot tilos csomagszinten hitelesítettnek nevezni.
- Az owner-only védelem üres vagy eltérő aktív/effektív Google-fióknál elutasít.
  Ez szűk **egyszemélyes demonstráció**, nem többfelhasználós jogosultságkezelés.

## Legkisebb jogosultság

Az appsscript.json kizárólag a **jelenlegi** táblázat írását, a
táblázatoldali UI-t és a Google-fiók e-mail azonosítását kéri.
A Code.gs fájlon @OnlyCurrentDoc szerepel. A script **nem**
hív Firebase-et, Cloud Functions-t, UrlFetchAppot vagy Drive API-t;
nem telepít installálható időzítőt, nem használ secret/service account kulcsot.
Nincs doGet/doPost, tehát **nem nyilvános webalkalmazás** és nincs mobilos URL.

## Hogyan lesz használható a következő fázisban?

1. A felhasználó által jogszerűen birtokolt, **üres, saját** Google-táblázatban
   lehet önálló, táblázathoz kötött Apps Script projektet létrehozni.
2. A Code.gs, Sidebar.html, appsscript.json fájlok **felülvizsgált**
   verzióját kell majd a tesztszkripthez szinkronizálni; erre később automatizált
   clasp workflow írható, de a jelenlegi PR ezt **nem hajtja végre**.
3. Csak a saját Google-fiók OAuth engedélyével szabad futtatni; ha a Workspace
   domain felügyeleti engedélyt követel, a lépést **kihagyjuk**, nem kerüljük meg.
4. A iMile DEMÓ menüből megnyitható a panel. Alapesetben semmilyen tábla nem
   keletkezik; az első **kifejezett mentés** hozza létre a demo munkalapot.
5. Az export csak szintetikus JSON. Az üzemi DepóKapacitásba továbbra sem
   importál automatikusan; a közös, jogosultsággal védett multi-user adatfolyam
   és a valódi riportautomatika külön későbbi feladat.

## Korlátok, amelyeket nem lehet elhallgatni

| Kérdés | A prototípus tényleges helyzete |
|---|---|
| Google-fiókos, díjmentes Sheet | Igen, meglévő saját fiók és rendelkezésre álló kvóta esetén |
| Egyidejű írás ütközése | ScriptLock + optimista revízió; nem Firestore-szintű többtáblás tranzakció |
| Több belső munkatárs | **Nem**: owner-only teszt, nincs RBAC |
| Mobilos megnyitás | **Nincs igazolva**: Sheets sidebar asztali felület |
| Autózár, kulcsleadás, 7+7 privát photoReceipt | **Nincs átemelve** a Google-hídba; #63 kód változatlan |
| Fotó Google Drive-ba | **Nincs**: csak külön adatvédelmi és hozzáférési terv után |
| Másnapi csomag-előrejelzés | Manuális aggregált tesztadat; semmilyen valós export nincs bekötve |
| Számlázás | Nincs kapcsolt felhős számlázás, fizetős szolgáltatás |
| Üzemi hozzáférés | Nincs bevezetve, jogszerű üzemi adatkezelést külön kell tisztázni |

A Google Apps Script napi és végrehajtási limitjei változhatnak: a hivatalos
dokumentáció szerint egy futás felső korlátja 6 perc; a napi triggerkeret
személyes fióknál 90 perc, de **ez a prototípus még nem tartalmaz triggert**.
A kvóta túllépésekor a szolgáltatás hibával áll le, nem automatikus fizetős
csomagra váltással.

A bridge.test.mjs lokális Node VM-mock vizsgálja a .gs szerveroldali kódot;
ez **nem élő Google Apps Script végponti teszt**. Az új funkciókat saját Draft
PR-ben, a korábbi #63 továbbfejlesztése nélkül tartjuk.

Hivatkozások:
- https://developers.google.com/apps-script/guides/html
- https://developers.google.com/apps-script/guides/services/quotas
- https://developers.google.com/apps-script/guides/services/authorization
- https://developers.google.com/apps-script/reference/lock/lock-service


## 2. lépés – DepóKapacitás JSON-átadás és mobilos csak olvasó előnézet

A külön Draft fejlesztés a meglévő DepóKapacitás **Excel és adatok** nézetében
egy Google Sheets DEMÓ JSON-fájlt **csak lokálisan** dolgoz fel:

- A Google Sheets owner-only menü az exportot imile.demo-demand.v2 sémával készíti.
  Az új, kézzel megadott tervezett/megerősített kapacitás a draftCapacities
  mezőben, estimatedOnly:true jelöléssel szerepel.
- A Depó önálló google-demo-preview.mjs modulja fájlméret-, schema-, nap-,
  kerület-, duplikáció-, érték- és kapacitás-ellenőrzés után megmutatja a
  kerületi hiányt vagy többletet. A korábbi v1 exporttal is működik, de
  annak ismeretlen kapacitása **nem nulla**, hanem üres/unknown.
- A művelet nem használ Firestore writeBatch, setDoc, runTransaction, nem
  ír Google-táblázatba és nem importál semmit a központi adatbázisba.
  A böngészőmunkamenetben marad; felhasználóváltáskor törlődik a memória.
- A meglévő Depó mobilbarát felületén is megjeleníthető **ha a meglévő
  ingyenes Spark/Auth/Firebase belépés már működik**. Ez **nem** nyilvános,
  önálló Google Web App, és nem bizonyítja az éles mobilos Google-szinkront.
- A számítás kézzel bevitt, szintetikus tervezés; nem tracking ID-alapú,
  nem bizonyított aktív futár, jármű- vagy Attendance kapacitás.
  A megjelenített hiány/többlet nem automatikus üzemi foglalási döntés.
- A teljes staging preview builder a hozzáadott tiszta parser modult külön,
  egyetlen új webfájlként csomagolja, a Google Scriptet és a tesztfájlokat
  nem publikálja. Nincs cloud deploy és nincs valós Google-adat.

A következő ingyenes mérföldkő külön vizsgálandó: működő, jóváhagyás nélkül
használható és biztonságos többfelhasználós adatkapcsolat. Amíg ez nem igazolt,
az owner-only Sheets DEMÓ és a Depóban végzett read-only import külön marad.


### Külön belépés nélküli mobilos DEMÓ-megjelenítő

A depokapacitas/google-demo-preview.html teljesen statikus, ingyenes,
szintetikus JSON-olvasó. Saját Google- vagy Firebase-belépés nélkül is
elindítható, amennyiben a statikus oldal jogszerűen elérhető / a helyi fájlok
együtt vannak kiszolgálva. A CSS telefonra optimalizált, a táblázat vízszintesen
görgethető. Működő statikus host nélkül **nem állítjuk**, hogy élő internetes
címe van.

- Szintetikus minta egy gombbal kipróbálható fájl feltöltése nélkül.
- A Google Sheets DEMÓ v1/v2 JSON kizárólag böngészőmemóriában olvasható.
- Nincs fetch, XMLHttpRequest, Google API, Firestore, Storage, IndexedDB,
  localStorage, cookie, szinkron vagy automatikus megosztás.
- A megjelenítés csak DOM textContent-tel történik, nem HTML-értelmezéssel.
- A nézet törlése és a lap bezárása nem módosít adatot. Mobilböngészőn is
  továbbra is teljesen **nem hitelesített** a kézi kerületi tervezés.
- A GitHub staging preview builder a szükséges HTML/CSS/JS modult és a közös
  szigorú parser-t engedélyezett statikus fájlként csomagolja; az Apps Script
  szerveroldali Code.gs fájlt **nem** publikálja.
