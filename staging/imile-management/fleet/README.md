# Közös Firebase Flotta – staging

A `fleet/index.html` kezeli a közös `drivers` és `vehicles` törzset. A hozzá kapcsolt
`operations.html` ugyanazt a Firebase Auth munkamenetet használja, külön belépés és
Apps Script-hívás nélkül. A DepóKapacitás ugyanezeket a törzsdokumentumokat olvassa.

## Elérhető funkciók

- Adminisztrátori autó- és futártörzs létrehozás/szerkesztés, azonosító- és
  optimista ütközésellenőrzéssel; az inaktiválás állapotmódosítás.
- Járműadatok, kötelező biztosítás/casco/műszaki/bérlet lejáratok, szervizdátum/km,
  gumicsere, futártelefon és jogosítvány, tankolókártyák, telefonok, kapcsolatok.
- Szervizrekord mentése és a közös járműállapot frissítése egy tranzakcióban.
- Kiadás/visszavétel páros autó–futár zárolással, csökkenő km-óra és dupla kiadás
  tiltásával. Az események nem szerkeszthetők és nem törölhetők kliensből.
- Keresés, 60 napos lejárati figyelmeztetés, JSON export és nyomtatható riport.

A fizikai kiadás és a Depó napi foglalása külön folyamat. A fizikai kiadás nem
tiltja automatikusan egy másik nap jövőbeli tervezését. A közös szervizállapot
azonban kizárja a járművet az új Depó-foglalásokból.

## Jogosultságok és adattárolás

Aktív admin/editor/viewer felhasználó olvashat; a törzs és a szervizállapot
módosítása admin feladat. Az editor más flottarészadatokat és kiadást/visszavételt
rögzíthet. A viewer nem írhat. Minden engedélyt Firestore Rules ellenőriz.

- `fleetRecords/{kind__key}`: típusosan validált `data`, egész `revision`,
  változtathatatlan `createdAt`/`createdBy`, szerveridős `updatedAt`/`updatedBy`.
- `fleetAssignments/{plate}` és `fleetDriverAssignments/{DA}`: egyező autó–futár
  kapcsolatok, aktív állapot, km és az esemény azonosítója. Együtt írhatók.
- `fleetMovements/{autoId}`: csak bővíthető kiadás/visszavétel napló.

A részadatok és események kliensből nem törölhetők. Tesztadat-takarítás kizárólag
elkülönített stagingben, mező- és hivatkozásellenőrzés, valamint updateTime
előfeltétel után történhet adminisztratív IAM-hozzáféréssel. Nincs automatikus
éles import vagy háttérszinkron a régi flottához.

## Automatikus ellenőrzés

- `operations.test.mjs`: 27 offline séma-, lejárat-, tranzakció- és kiadási eset.
- `rules-emulator.mjs`: 99 pozitív/negatív Firestore-próba, kizárólag
  `demo-imile-fleet`, helyi `127.0.0.1:8787`. Ehhez Node >=24.12 és Java 21 kell.
- A CI npm lockfájllal telepíti a tesztfüggőségeket, és automatikusan elindítja az
  emulátoros csomagot. Nem használ Firebase secretet és nem ér el felhőadatokat.
- Az előnézeti csomagoló csak a webhez engedélyezett fájlokat másolja; a tesztek,
  szabályok, npm-függőségek és diagnosztikai naplók nem kerülnek a Hostingra.

## Élesítés előtt még szükséges

Ez a staging átültetés nem igazolja a régi alkalmazás teljes funkcióparitását.
Nincs éles adatimport, történeti JSON-visszatöltés, eredeti HTML-megosztás,
régi Apps Script-szinkron vagy Attendance-hozzáférés átállítva. A helyreállítási
próbát, személyenkénti éles jogosultságokat, teljes regressziót és az adatátállást
külön ellenőrizni/jóváhagyni kell. A main, a live Hosting és az éles flotta
nem része ennek a kiadásnak.
