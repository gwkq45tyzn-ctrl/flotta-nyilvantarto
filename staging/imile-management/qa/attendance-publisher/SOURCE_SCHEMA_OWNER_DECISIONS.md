# Mobile Attendance: forrásazonosítás előfeltétele – csak offline QA

Ellenőrzött (2026-11-01): a csatlakoztatott Google Sheets
`iMile Driver Attendance - Log In Out` / `Mobile Attendance` munkalap
`A1:Z1` fejléce **16 nem üres** oszlopot tartalmaz:
Timestamp, Driver Name, DA Code, Vendor, Attendance Type, Latitude, Longitude,
GPS Accuracy (m), Distance from Warehouse (m), Warehouse, Remarks, Status,
Car Photo - Front, Car Photo - Left Side, Car Photo - Right Side,
Car Photo - Back.

A valódi sorokat nem olvastuk. Ebben a PR-ben nincs Sheets- vagy Firebase-írás,
ID-gyártás, beimportálás, staging/main-merge vagy deploy.

## Mit ellenőriz a csak memóriában futó modul?

`source-header-gate.mjs` teljesen tiszta, kizárólag átadott fejlécadatból
dolgozik. A jelenlegi 16 oszlopra `legacy_16_column_source` eredményt ad,
és azonosítja a **hiányzó stabil esemény-ID és explicit rendszám** mezőt.
Nem olvas Google-t, nem generál stabilnak látszó hash-ID-t, nem állít ki
`confirmedAt`-ot és soha nem enged foglalási/Firestore-írást.

Egy **jóváhagyásra javasolt**, még nem elfogadott 18 oszlopos forma:

- Az eredeti A–P oszlop változatlan sorrendben, visszamenőleg is megőrizve
- Q: `Source Event ID` – a forrásbelépéskor kiadott, immutábilis és egyedi
  azonosító; a módosítás és törlés ugyanazt az ID-t hivatkozza
- R: `Vehicle Plate` – a felhasználó által ténylegesen kiválasztott,
  azonosított autó rendszáma; nem szabad fotóból, régi autóhasználói
  feliratból vagy DA-kódból kikövetkeztetni

Az oszlopnév megjelenése **nem** bizonyítja a mögöttes ID életciklusát,
a beviteli jogot, a járműlista hitelességét, a régi sorok teljességét vagy
az IAM publikálót. Ezért a 18 oszlopos javaslatra is
`sourceReady:false`, `authorizedForBooking:false`,
`writesAllowed:false` és `migrationApproved:false` az eredmény.

A már meglévő 16 oszlopos sorokat nem szabad sorszám vagy változékony
`Timestamp|DA|Photo` hash alapján utólag stabilnak feltüntetni. Ezek
`legacy/unverified` kategóriában maradjanak, amíg az adatgazda által
hitelesített forrásazonosító és jármű-hozzárendelés nincs.

## Még tényleges Work / forrásgazdai döntést igényel

1. Ki a Mobile Attendance Google Form/tábla tényleges tulajdonosa, és
   melyik szkript, trigger és GCP-identitás dolgozza fel a sorokat?
2. Jóváhagyható-e a két új mező és hogyan garantálja a **forrás** az új ID
   immutabilitását, a javítás/törlés auditját, valamint a rendszám kötelező,
   tényleges kiválasztását?
3. Hogyan kezeljük a régi, azonosító/rendszám nélküli sorokat úgy, hogy
   ne állítsunk ki hamis `clear` bizonylatot?
4. Miként történik a teljes forrásgeneráció sorosítása/fence-elése a külön
   IAM-írókkal és az Attendance + projection atomi Firestore-commitjával?
5. Hogyan tartható fenn a #28 120 másodperces időkapuja az 5 perces
   forrás-polling helyett? A kizárólag külön heartbeat nem elfogadható.

**Gát:** PR #28, #29, #31 és ez a QA ág nem alkalmas üzemi bevezetésre az
adatforrás/tulajdonos/IAM ellenőrzés és jóváhagyás nélkül.
Ez nem új foglalási vagy Attendance-író megoldás, csak a hiányzó forrásmezők
determinista ellenőrzése.
