# Attendance → automatikus autókiadás, visszavétel és tényleges kapacitás (staging)

Állapot: a forrásadat és a jogosultságok áttekintve; stagingben elkészült az idempotens, csak olvasó esemény-rekonstrukció és a Flotta + DepóKapacitás megjelenítés. **Éles autókiadásra és valós adatokra nem aktiváltuk.**

## 1. Valós forrás – ellenőrzés 2026-10-30

Google Sheets: `iMile Driver Attendance - Log In Out`, tab: `Mobile Attendance`.
A tényleges A:P fejléc:

A Timestamp, B Driver Name, C DA Code, D Vendor, E Attendance Type,
F Latitude, G Longitude, H GPS Accuracy (m), I Distance from Warehouse (m),
J Warehouse, K Remarks, L Status, M Car Photo - Front,
N Car Photo - Left Side, O Car Photo - Right Side, P Car Photo - Back.

**Jelenleg nincs rendszám / járműazonosító mező**. Az Attendance eseményből tehát nem lehet bizonyosan megállapítani, hogy melyik autót adta ki a depó. Ne próbáljuk a rendszámot fotó alapján, a korábbi beosztásból vagy tetszőleges mezőből automatikusan kitalálni.

## 2. Szükséges adatforrás-bővítés, élesítés előtt

A Google Attendance-űrlapban legyen egy **Vehicle Plate / Rendszám** legördülő. A választék a Flotta közös `vehicles` törzséből származzon; az érték pontos normalizált rendszám legyen, ne autómodell vagy szabad szöveg. A felület Log In-nél kérje kötelezően, Log Out-nál a futár nyitott kiadásából töltse ki, és legyen külön lehetőség „nem vettem fel autót” esetére (ekkor nincs automatikus kiadás).

A Google Apps Script staging `Code.gs` változata már felismeri a fejlécből a Vehicle Plate / Vehicle ID / License Plate / Rendszám / Autó rendszáma elnevezést. Az eddigi 16 oszlopos sorokat változatlanul szinkronizálja, az új, érvényes `vehicleId` mezőt pedig opcionálisan viszi a Firestore `attendance` dokumentumba. A staging Firestore Rules forrásában a `vehicleId` opcionális és validált. A változások még **nincsenek éles szinkronra publikálva**. A szkript projektazonosítója a repóban placeholder, így nem tekinthető aktiváltnak.

## 3. Log In és Log Out üzleti szabályai

- **Log In + érvényes DA + kiválasztott, szabad jármű:** `issued` autóhasználat (futár, jármű, időpont, Attendance-esemény ID).
- **Futár már használ autót / autó másnál van / autó szervizben / inaktív futár / ütköző napi foglalás:** tiltás vagy kivizsgálandó figyelmeztetés, soha nem automatikus felülírás.
- **Log In rendszám nélkül:** jelenléti esemény megmarad; autókiadás nem keletkezik.
- **Log Out ugyanahhoz a futárhoz, négy visszaadási fotóval:** `returned`, kiadás lezárva; csak ezután lehet újra szabad az autó.
- **Log Out hiányzó fotóval, téves rendszámmal, hiányzó Log In-nel vagy kétes időponttal:** `return_review` vagy figyelmeztetés, az autó ne váljon automatikusan szabaddá.
- **Duplikált esemény / újrapróbált szinkron / időrendben késve érkező esemény:** idempotens, determinisztikus feldolgozás, nincs dupla kiadás/visszaadás.
- A fényképek, a pontos eseményidők, a forrás-sorazonosító és az előzmények megmaradnak auditálásra.
- Az autó átvételi/visszaadási kilométeróraállását a jelenlegi Attendance nem tárolja; ehhez később külön mező kell.

## 4. Megjelenítés a két modulban

**Flotta staging:** a közös Firestore Attendance alapján olvasható automatikus autóhasználat (nyitott, visszaadott, ellenőrzésre váró), és ennek figyelembevételével a valóban szabad autók száma. A törzs `vehicles.status` nem módosul az autókiadástól: az `Elérhető` jármű lehet éppen futárnál is, különálló használat-nyilvántartás szükséges.

**DepóKapacitás staging:** az Attendance alapján ténylegesen dolgozó, autót felvett futárok és egyszer számított napi kapacitás elkülönített kimutatása. A kézzel előre tervezett `bookings` kapacitással nem adható össze ugyanaz a futár kétszer.

A jelenlegi staging megvalósítás **olvasó rekonstrukció**, nem rögzít élő vagy végleges autókiadási rekordot. Az események forrása még nem biztosít rendszámot. Az új felület csak stagingbe telepítve, valós böngészős teszttel tekinthető kipróbáltnak.

## 5. Éles automatizálás előtt kötelező kapuk

1. Legyen működő rendszámválasztás az Attendance űrlapban (szabad járművek csak, szerveroldali ütközésvédelemmel).
2. Legyen Firebase IAM-jogosultsággal futó, idempotens, tranzakciós feldolgozó (például az időzített Apps Script kiterjesztése). A Google Form legördülő **önmagában nem akadályozza meg** a két egyidejű választást.
3. A szerver atomikusan ellenőrizze a futár és autó nyitott kiadását, és csak ellenőrzött Log Out után zárja a foglalást. Ne támaszkodjon pusztán kliensoldali állapotra.
4. Kell jogosultságvizsgálat és kivétellista: nincs autó, eltérő autó, elmaradt kijelentkezés, sérülés, hibás fotó, GPS-probléma, időrendben késő esemény.
5. Külön tesztkörnyezet, mesterséges rekordok, valós böngészős E2E, visszaállítás.
6. Tényleges depóadatokon csak külön GO/NO-GO döntéssel, előbb naplózós előnézetben, majd részleges bevezetéssel.

A GitHub `main` ág, az éles flotta, a valódi Attendance Google Sheet és annak Google Form-ja változatlan marad, amíg ezeket a kapukat nem igazoltuk.
