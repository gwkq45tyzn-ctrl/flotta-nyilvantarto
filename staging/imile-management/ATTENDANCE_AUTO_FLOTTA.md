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

## 2. Új, felhasználó által bejelentett forrásadatok – 2026-10-31

A felhasználó jelezte: az **iMile Driver Attendance - Log In Out** táblázatba a futár a jövőben az autó átvételekor a **rendszámot és az aktuális kilométeróra-állást** is rögzíteni fogja a fotók mellett.

**A táblázat és az űrlap bővítését nem az iMile Management végzi.** Az Attendance és a VEHICLE_Fuel_Database továbbra is szigorúan **csak olvasható forrás**: se írás, se űrlap-, oszlop-, képlet- vagy beállításmódosítás nincs engedélyezve a fejlesztő rendszerből.

Amint az új mezők valóban megjelennek, a pontos fejlécnevek ellenőrzése után a csak olvasó szinkron átveszi:
- Log In: DA-kód, időpont, **rendszám**, **átvételi km**, négy autófotó, forrásesemény azonosítója.
- Log Out: DA-kód, időpont, fotók és – ha szerepel – a **visszaadási km**. Az autót az adott futár igazolt, nyitott kiadásához kapcsolja; nem találgat rendszámot.
- Hiányzó/érvénytelen rendszám vagy km, ismétlődő bejegyzés, már másnál lévő autó: nem automatikus kiadás, hanem **Ellenőrizendő**.
- Az autó adatlapján a teljes átadás-visszaadás előzmény és az eredeti Attendance-ből származó fotóhivatkozások elérhetők legyenek. A fotók megnyitásához Drive-jogosultság szükséges.

A napi VEHICLE_Fuel_Database beosztás **ellenőrzésre** szolgál: ha eltér a futár által ténylegesen megadott rendszámtól, eltérésriasztás jelenjen meg; az eltérést nem szabad csendben felülírni. A manuális beosztás mentése kizárólag a saját iMile adatbázisba történhet.

**Fontos nyitott követelmény:** a felhasználó egyelőre csak az **átvételi km** mező bevezetését jelezte. A tényleges visszaadás km-adatát nem szabad kitalálni vagy az átvételi értékkel helyettesíteni. A jelenlegi staging Flotta-művelet mind kiadáskor, mind visszavételkor kilométeróra-állást kér, ezért a Log Out automatikus tranzakciójához záró km mező vagy külön, km- nélküli és ellenőrizendő visszaadási folyamat szükséges. A teljes, km-ben is lezárt automatikus visszaadást **nem tekinthetjük késznek**, amíg ez nincs megoldva.

A Google Apps Script staging `Code.gs` változata már felismeri a fejlécből a Vehicle Plate / Vehicle ID / License Plate / Rendszám / Autó rendszáma elnevezést. Az eddigi 16 oszlopos sorokat változatlanul szinkronizálja, az új, érvényes `vehicleId` mezőt pedig opcionálisan viszi a Firestore `attendance` dokumentumba. **A km-óra mező szinkronja még nincs beépítve**, és a változások nem kerültek éles szinkronra publikálásra. A szkript projektazonosítója a repóban placeholder. A forrás Google-táblát nem módosítjuk.

A Google Apps Script staging `Code.gs` változata már felismeri a fejlécből a Vehicle Plate / Vehicle ID / License Plate / Rendszám / Autó rendszáma elnevezést. Az eddigi 16 oszlopos sorokat változatlanul szinkronizálja, az új, érvényes `vehicleId` mezőt pedig opcionálisan viszi a Firestore `attendance` dokumentumba. A staging Firestore Rules forrásában a `vehicleId` opcionális és validált. A változások még **nincsenek éles szinkronra publikálva**. A szkript projektazonosítója a repóban placeholder, így nem tekinthető aktiváltnak.

## 3. Log In és Log Out üzleti szabályai

- **Log In + érvényes DA + beolvasott rendszám + validált átvételi km + szabad jármű:** `issued` autóhasználat (futár, jármű, km-óra, időpont, Attendance-esemény ID, eredeti fotók).
- **Futár már használ autót / autó másnál van / autó szervizben / inaktív futár / ütköző napi foglalás:** tiltás vagy kivizsgálandó figyelmeztetés, soha nem automatikus felülírás.
- **Log In rendszám vagy átvételi km nélkül:** a jelenléti esemény megmarad; automatikus autókiadás nem keletkezik.
- **Log Out ugyanahhoz a futárhoz, négy visszaadási fotóval:** a visszaadás eseménye összekapcsolható az aktív kiadással. **Km-ben is végleges `returned` státusz csak hiteles visszaadási kilométeradat vagy külön elfogadott, km nélküli üzleti szabály alapján lehetséges**; hiány esetén `return_review`.
- **Log Out hiányzó fotóval, téves rendszámmal, hiányzó Log In-nel vagy kétes időponttal:** `return_review` vagy figyelmeztetés, az autó ne váljon automatikusan szabaddá.
- **Duplikált esemény / újrapróbált szinkron / időrendben késve érkező esemény:** idempotens, determinisztikus feldolgozás, nincs dupla kiadás/visszaadás.
- A fényképek, a pontos eseményidők, a forrás-sorazonosító és az előzmények megmaradnak auditálásra.
- A bejelentett jövőbeni Attendance-űrlap az átvételi km-t már rögzíteni fogja; a visszaadási km-ről még nincs megerősített adat. Addig a kilométerkülönbség nem számítható ki.

## 4. Megjelenítés a két modulban

**Flotta staging:** a közös Firestore Attendance alapján olvasható automatikus autóhasználat (nyitott, visszaadott, ellenőrzésre váró), és ennek figyelembevételével a valóban szabad autók száma. A törzs `vehicles.status` nem módosul az autókiadástól: az `Elérhető` jármű lehet éppen futárnál is, különálló használat-nyilvántartás szükséges.

**DepóKapacitás staging:** az Attendance alapján ténylegesen dolgozó, autót felvett futárok és egyszer számított napi kapacitás elkülönített kimutatása. A kézzel előre tervezett `bookings` kapacitással nem adható össze ugyanaz a futár kétszer.

A jelenlegi staging megvalósítás **olvasó rekonstrukció**, nem rögzít élő vagy végleges autókiadási rekordot. A tényleges Google-forrásban a rendszám és átvételi km mezők megjelenése még nem ellenőrzött. Az új felület csak stagingbe telepítve, valós böngészős teszttel tekinthető kipróbáltnak.

## 5. Éles automatizálás előtt kötelező kapuk

1. A Google forrásgazda által külön bevezetett rendszám és **átvételi km** mezők kerüljenek ténylegesen a beolvasott Attendance sorokba; a forrást **nem a fejlesztés módosítja**. Érvényesített, idempotens és szerveroldali ütközésvédett átvétel szükséges.
2. Legyen Firebase IAM-jogosultsággal futó, idempotens, tranzakciós feldolgozó (például az időzített Apps Script kiterjesztése). A Google Form legördülő **önmagában nem akadályozza meg** a két egyidejű választást.
3. A szerver atomikusan ellenőrizze a futár és autó nyitott kiadását, és csak ellenőrzött Log Out után zárja a foglalást. Ne támaszkodjon pusztán kliensoldali állapotra.
4. Kell jogosultságvizsgálat és kivétellista: nincs autó, eltérő autó, hiányzó/érvénytelen átvételi km, hiányzó záró km, elmaradt kijelentkezés, sérülés, hibás fotó, GPS-probléma, időrendben késő esemény.
5. Külön tesztkörnyezet, mesterséges rekordok, valós böngészős E2E, visszaállítás.
6. Tényleges depóadatokon csak külön GO/NO-GO döntéssel, előbb naplózós előnézetben, majd részleges bevezetéssel.

A GitHub `main` ág, az éles flotta és a VEHICLE_Fuel_Database változatlan marad. Az Attendance Google Sheet és Form későbbi bővítését a forrás kezelője intézi; az iMile Management ezt kizárólag olvashatóan követi.
