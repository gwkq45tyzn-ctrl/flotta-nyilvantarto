# iMile Management – megbízható riportmentés és teljes verziótörténet (STAGING)

## Biztonsági eredmény, 2026. október 31.

A jelenlegi publikált `imile-qa` riportfelület **még a kliensből írja**
a `performanceDays`, `inventoryDays` és audit dokumentumokat. A 23
sikeres Firestore-emulátoros jogosultsági teszt nem bizonyítja a belső
rekordok darabszámainak, egyediségének vagy tartalomhash-ének hitelességét.
Jogosult, de módosított kliensből írt logikailag hibás adatot a meglévő
Firestore-szabályok nem feltétlenül utasítják el. Emiatt a kiépített QA
**nem tekinthető vállalatilag jóváhagyott üzemi importnak**.

## Ebben a PR-ben elkészült

`server/trusted-report-validation.mjs`:
- Kizárólag megbízható Node szerverkörnyezetben, verifikált Firebase
  tokenből származó UID-dal, Admin SDK Firestore-adatbázison alkalmazható.
- Kötelező, pontos és véges alakú In-Hub / OFD riport.
- A szerver újraszámolja `totalOFD`, `totalDelivered`, `courierCount`,
  `total` értékeket. Kizárja a negatív, túlzó vagy nem egész darabszámot.
- OFD: azonos nap + depó alatt a DA-kód csak egyszer szerepelhet;
  DLD nem lehet OFD fölött.
- In-Hub: minden receive dátum valódi, nem jövőbeli, rendezett, egyedi;
  minden kerület/település egyedi; minden dátumhoz pontosan egy darabszám.
- A szerver maga képez egy rendezett, determinisztikus SHA256 hash-t.
  A kliens által megadott hash, verzió vagy belső státusz **nem** kerül
  át az elfogadott riportadatba.
- A felhasználói szerepkörre a tranzakció is rákérdez a `users/{uid}`
  dokumentumban: aktív admin/editor menthet, viewer/anonim nem.
- Egyetlen Firestore-tranzakcióban készül az aktuális nap/depó állapot,
  a **teljes, változatlan tartalmú** verzió-archívum
  (`performanceVersions` / `inventoryVersions`) és az audit esemény.
- Azonos hash+státusz: idempotens, új verzió nélkül. Eltérő adat:
  kifejezett jóváhagyás + ismert korábbi verzió.
- Korábbi `final` eredmény nem írható át `provisional` eredménnyel.
- Korábbi staging kliensből származó riport archiválható, de
  `legacy-unverified` megjelölést kap; a hash visszamenőleg nem bizonyítja
  az eredeti forrás valódiságát.

## Fontos különbség: szerveroldali számítás és valódi forrásigazolás

A szerveroldali összesítés-vizsgálat **nem igazolja**, hogy a felhasználó
által beadott mennyiségek valóban megegyeznek az iMile eredeti exportjával.
Ehhez az eredeti Excel-fájl vagy annak egy hiteles, jóváhagyott forrásadaptere
alapján, szerveren is el kell végezni a forrás-ellenőrzést. Személyes adatot
tartalmazó nyers fájl szerverre továbbítása nem megengedett külön céges
adatkezelési és adatmegőrzési jóváhagyás nélkül.

## Meglévő felület és szabályok

Ez a PR **még nem** állítja át a kliensmentést, és nem telepít
szerveroldali API-t vagy új Firestore ruleset-et. A meglévő (staging)
kliens mentési útja változatlan. A jelenleg éles adatokat, a Flotta
production `main` ágat, a Google forrásokat és az `imile-qa` publikus
preview-t nem módosítja.

A teljes biztonsági bevezetéshez egységes átállás szükséges:

1. Belső, vállalatilag jóváhagyott, hitelesített szerverhost és
   `verifyIdToken` HTTP-belépési pont; semmilyen Admin SDK / service
   account titok nem lehet a kliensben vagy GitHubban.
2. A `report-app.mjs` ne közvetlenül a Firestore-ra írjon, hanem csak
   validált szerveroldali műveleten keresztül, amely a nyers export és
   a csomagolt táblázat kapcsolatát is igazolja.
3. A kliensből történő **mindennemű** create/update/delete legyen
   letiltva az aktuális riportsnapshots, auditok és verzióarchívum
   kollekcióiban; Firestore Admin SDK-ra csak a zárt backend kapjon jogot.
4. Server-only API role, race, idempotencia, határérték, 1MiB-es
   dokumentumméret, replay, token érvényesség és korrigálhatóság E2E.
5. A régi staging hat mesterséges riport/audit dokumentumát kizárólag
   dokumentált, külön felhatalmazott adminisztratív tisztítással kezeljük.
6. Verzióarchívum visszaállítási próba: a `v1` és `v2` teljes tartalma
   lekérhető, a régi unverified tartalom egyértelműen jelölt.
7. Csak ezután egyben történő szerver-, rules- és web-átállítás
   külön staging QA és rollback terv alapján. Nem aktiválunk
   fizetős felhőszolgáltatást kifejezett jóváhagyás nélkül.

## Zárt végső követelmény

A statisztikák és riportok megjelenítésében az ismertlen/missing/cache
nem szerepelhet hiteles nullaként, a napi előzetes riport nem számíthat
végleges napi sikerességi KPI-nak. A statisztikai forrásazonosítás, történet
és átállás minden esetben auditálható kell legyen.
