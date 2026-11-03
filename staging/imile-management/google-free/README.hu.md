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
