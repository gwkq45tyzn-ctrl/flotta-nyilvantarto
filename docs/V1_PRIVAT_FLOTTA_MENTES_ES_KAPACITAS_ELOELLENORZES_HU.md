# iMile Flotta + Depó V1 — privát tulajdonosi adatmentés és kapacitás-előellenőrzés

**KIZÁRÓLAG HELYI, CSAK OLVASÁSI / JÓVÁHAGYÁS ELŐTTI ELJÁRÁS.**
Ez a dokumentum nem production telepítési utasítás, és semmilyen „zöld” helyi eredmény nem jelent élesítésre vagy importálásra jogosultságot.

## 1. A forrás azonosítása, mielőtt bármit módosítanál

A Flotta Google Sheet alapú régi backendjében a teljes négytömbös appállapot nem feltétlenül látszik a „Járművek” vagy más, kényelmi nézeteken. Az érintett, jogosultan hozzáférhető **saját** táblázatban a `_APP_STATE` lapon egy verzió, egy frissítési idő és egy teljes JSON állapot szerepelhet. A jelenlegi adattárolásban ez tipikusan **A2 / B2 / C2**. A munkalap szerkezete később változhat: nem szabad vakon egy másik fájl hasonló nevű lapját elfogadni.

1. A jogosult tulajdonos azonosítsa a valós, jelenleg használt eredeti Flotta-fájlt és a hozzá tartozó telepített Apps Script-írókat. A fájl neve önmagában **nem igazolja a kanonikus forrásvoltát**.
2. Rögzítse privát helyen az eredeti verziót és módosítási időt, majd mentse el a C2 teljes JSON karakterláncát **változtatás nélkül**, UTF-8 kódolással `.json` fájlba. Ne szerkessze a Google Sheet celláit; ne állítson át semmit az éles rendszeren.
3. Újbóli kiolvasáskor ellenőrizze, hogy a verzió, az időbélyeg **és az eredeti teljes JSON** azonos maradt. Ha a központi forrás közben megváltozott, a mentési kör **érvénytelen**, az új állapotból kell újrakezdeni.
4. Egy **külön**, tulajdonosi mentési eljárás keretében őrizze meg az eredeti forrás független, visszaállítható példányát és külsőleg rögzített SHA-256-át. Egy saját magából újra kiszámított hash nem független hitelesítés.

**SOHA ne másolja be a teljes JSON-t GitHub issue-ba/PR-be, publikus chatbe, CI-ba vagy nyilvános felhőtárhelyre.** A valós adatok tartalmazhatnak neveket, telefonszámokat, rendszámokat, kártyaazonosítókat és beágyazott eseménytörténetet.

## 1/A. Két külön, helyi _APP_STATE kiolvasás + a ténylegesen mentett JSON egyezése

Az előző pontban rögzített, saját jogosultsággal megnyitott forrásból **kétszer külön** jelöld ki az `_APP_STATE` lap `A2:C2` cellatartományát, és másold ki az egy sorba eső három cellát két egymástól független, UTF-8 formátumú **privát** szövegfájlba (`elso.tsv`, `masodik.tsv`). A táblázatot **ne szerkeszd**. A harmadik privát fájl (`flotta-eredeti.json`) a C2 **teljes, változatlan** JSON-tartalma legyen, egyetlen karakter hozzáadása nélkül.

A Google Sheets által automatikusan idézőjelezett TSV JSON-cellát a helyi ellenőrző feldolgozza. Alternatív helyi fájlformátum: egyetlen JSON tömb, amelynek három értéke `[revision, updatedAt, stateJsonString]` (a harmadik **sztring**, a teljes C2). A teljes JSON, a TSV vagy bármely azonosító **nem kerülhet a GitHubra, CI-ba vagy nyilvános beszélgetésbe**.

```bash
node tools/v1-private-appstate-double-readback.mjs \
  --first "/privat/elso.tsv" \
  --second "/privat/masodik.tsv" \
  --saved "/privat/flotta-eredeti.json" --json
```

A `localReadbackAndSavedBytesConsistent:true` csak azt igazolja, hogy a **három általad helyben megadott fájl** azonos változatot jelöl, ugyanazt a teljes C2-szöveget tartalmazza, és a külön lementett JSON byte-pontosan megegyezik a C2-vel. Az eltérő verzió, időbélyeg, JSON vagy mentett fájl **STOP**. Az `operationallyReady:false` ettől külön, például hiányzó aktív futárkapacitást jelez; a kapacitás nélküli eredeti mentést **nem szabad eldobni**.

**Fontos:** a két helyi fájl önmagában nem bizonyítja, hogy a táblázat a valódi, hiteles forrás vagy nincs másik éles Apps Script író, helyi függő módosítás, cache vagy jogosulatlan szerkesztő. Az eredeti mentés független tárolása, hashének külső rögzítése és a visszaállítás próbája továbbra is külön feladat. A script **sem mentést nem hoz létre, sem adatot nem tölt fel vagy módosít**.

## 2. Az eredeti négy adattömb ellenőrzése (adatot nem módosít)

A helyileg mentett privát JSON-nak **mind a négy** tömböt tartalmaznia kell: `vehicles`, `drivers`, `fuelCards`, `contacts`. Ezen felül minden ismeretlen root/nested mezőt és `history` tartalmat meg kell őrizni.

A GitHub-repository helyi másolatában:

```bash
node tools/v1-owner-readiness-cli.mjs --input "/privat/flotta-eredeti.json" --json
```

A parancs csak darabszámot, hibaazonosítókat és *helyileg számolt, önmagában nem hiteles* SHA-t közöl. **Nincs hálózati írás, sem adatimport.** A `sourcePreflightOk` és az `operationallyReady` két külön feltétel: attól, hogy a négytömbös forrás strukturálisan érvényes, a futárok még lehetnek kapacitás nélkül.

## 3. Az aktív futárok kapacitása — külön jóváhagyás futáronként

A `tools/v1-owner-capacity-review.html` fájl a saját számítógépen, **offline** megnyitható böngészőben. A teljes, privát JSON kiválasztása után:

- Minden **aktív** futár kapacitása külön ellenőrizhető. A **70 csomag csak javaslat**, nem automatikus változtatás.
- Futáronként a valós, vállalt kapacitást kell megadni egész számként, majd **külön bejelölni az „ellenőriztem” mezőt**. Az inaktív és bizonytalan státuszú futárokat nem szabad automatikusan aktívvá tenni.
- A program csak akkor engedi az új privát JSON exportját, ha az összes aktív futárnál megtörtént a tudatos áttekintés.
- A letöltött új JSON-t **külön újra ki kell választani** a helyi SHA-256 és teljes tartalmi egyezéshez. Csak ezután tölthető le az **azonosítóktól megtisztított összesítő**.
- A változtatás kizárólag a privát új fájlban történik. A régi, teljes forrás és a Google Sheet **változatlan** marad. A két fájl forrásazonosítója eltérő: az eredeti forrást semmiképpen sem szabad az újjal csendben felcserélni.

### A tényleges régi → új Flotta-adatok külön ellenőrzése

A 70 csomagos javaslat futáronkénti jóváhagyása után az **eredeti** és az **új** Flotta-export közötti eltérést is kötelező megvizsgálni. A meglévő két `elso.tsv`, `masodik.tsv` kiolvasást és az eredeti `flotta-eredeti.json` fájlt tartsd meg. Hozz létre **csak a saját gépeden** egy `futar-jovahagyasok.json` fájlt, például:

```json
[
  {"daCode":"DA0001","kapacitas":70,"reviewed":true},
  {"daCode":"DA0002","kapacitas":80,"reviewed":true}
]
```

*A példában minden azonosító fiktív.* A tényleges fájlban minden **aktív futár** saját DA-azonosítóját és a tőle megerősített kapacitást add meg, **minden aktív futárhoz külön egy sort**, akkor is, ha a korábbi kapacitása érvényes. Ne változtasd automatikusan a 70-et mindenkinél.

A privát összehasonlításhoz:

```bash
node tools/v1-private-capacity-transition.mjs \
  --first "/privat/elso.tsv" \
  --second "/privat/masodik.tsv" \
  --original "/privat/flotta-eredeti.json" \
  --candidate "/privat/flotta-kapacitas-ellenorzott.json" \
  --decisions "/privat/futar-jovahagyasok.json" --json
```

A `locallyProvenOnlyReviewedCapacitiesChanged:true` azt jelenti, hogy az új fájlban csak az egyenként jóváhagyott **aktív futárkapacitások** térnek el az eredetitől. A járművek, km-ek, státuszok, történetek, tankolókártyák, kapcsolatok és az ismeretlen beágyazott mezők változatlanok. Bármilyen más eltérésnél **STOP**. A három bizonytalan státusz külön tulajdonosi felülvizsgálata továbbra is szükséges.

Ez **nem élesítés**, nem jelenti a különálló jóváhagyások hiteles ellenőrzését, és nem állítja át a Google Sheetet vagy a Firebase-t. Az új kapacitásos forrást új, külön ellenőrzött privát mentésként kell kezelni, a korábbi forrásmentést nem szabad felülírni.

Új előellenőrzés az **új** privát JSON-on:

```bash
node tools/v1-owner-readiness-cli.mjs --input "/privat/flotta-kapacitas-ellenorzott.json" --json
```

A futáronkénti felülvizsgálat és az adatminőség sikeres tesztje **nem** engedélyez éles írást vagy böngészős bulk-importot.

## 4. Méret és migrációs kapuk — még mindig csak offline

A már rögzített, ingyenes helyi Firebase SDK-függőségekkel:

```bash
node staging/imile-management/fleet/v1-private-proto-preflight.mjs \
  --input "/privat/flotta-kapacitas-ellenorzott.json" --json
```

A Firestore protobuf-méretellenőrzés szükséges, de nem helyettesíti a valós, teljes rollback-próbát. A jelenlegi migrációs bizonyítás 120 owned-read dokumentumra korlátozódik; **57 vagy több** futár+jármű rekordon a jelenlegi helyi importer előzetesen blokkol, nem kezd el részleges adatírást.

A régi Apps Script-írókhoz külön, teljes, *redaktált* tulajdonosi leltár szükséges. Ha az megvan, egy közös, kizárólag helyi ellenőrzés megakadályozza, hogy **eltérő eredeti forrásra** vonatkozó leltárt használjunk:

```bash
node tools/v1-source-cutover-bound-preflight.mjs \
  --fleet "/privat/flotta-eredeti.json" \
  --legacy-writers "/privat/legacy-writers-redacted.json" --json
```

**Fontos:** az eredeti `flotta-eredeti.json` és a felülvizsgált `flotta-kapacitas-ellenorzott.json` két külön állapot. A régi írólajstrom és a ténylegesen átváltandó adat SHA-ját kontrollált, explicit tulajdonosi forrásátmenetnek kell összekötnie; a saját fájlok egyezése nem igazol telepített, éles writer-stopot.

## 5. Production STOP / nem megkerülhető jogosultsági és biztonsági ellenőrzések

- Valódi, eredettől független, helyreállítható és külső hash-sel rögzített adatmentés, kölcsönösen egyeztetett verzió.
- Az aktív futárok kapacitásának tényleges megerősítése, bizonytalan státuszok felülvizsgálata, végleges forrás SHA-jának külön jóváhagyása.
- Firestore/UID/IAM, eredeti jogosultsági és server-side Rules igazolása, teljes migrációs próba, vészvisszaállítás.
- Létező Google Apps Script deploymentek, trigger- és korábbi kliensek íróképességének hiteles leltára és **szerveroldali** cutover bizonyítéka.
- Független audit és a tulajdonos **külön, konkrét release artifactra vonatkozó engedélye**.

**A teljes V1 addig NO-GO.** A különleges rendszerhozzáférés vagy vezetői/IT-jóváhagyás hiányát sosem szabad megkerülni. A halasztott OFD, In-Hub, Excel, Attendance és PWA funkciók nem részei az első Flotta+Depó kiadásnak.
