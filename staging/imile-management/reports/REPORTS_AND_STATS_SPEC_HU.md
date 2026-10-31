# iMile Management — Napi Excel-riportok és futárstatisztika
Állapot: **staging QA**, bevezetés előtti specifikáció. Kiinduló commit: `adc379047eb221883606a0ba199a29362ebad102`.
A korábbi felhasználói Excel-minták és képernyőképek rögzítik a kívánt vizuális szerkezetet.

## 1. Közös munkafolyamat
1. Belső admin/editor/viewer belép a meglévő Firebase Auth felhasználóval; a modul újra **szerverről** ellenőrzi az aktív jogosultságot. Külső vállalkozó nem kaphat hozzáférést.
2. A felhasználó kiválasztja: In-Hub Inventory vagy DA OFD Performance, feltölti a nyers `.xlsx` fájlt.
3. Az iMile-ból exportált, **kötelező, szó szerinti fejlécmezőket** és értékeket ellenőrizzük; hibás, hiányos, túl nagy fájl nem exportálható. A fájl csak a böngészőben van feldolgozva; nincs automatikus Firestore/Google-szinkron.
4. A `sheet1` a nyers forrássorokat, a `Sheet2` a mintával egyező riportot tartalmazza.
5. A kész Excel külön letölthető és továbbküldhető. Import, adatmentés és KPI-statisztika-engedélyezés **külön** döntési/felülvizsgálati lépés.

## 2. In-Hub Inventory — Sheet2-szerződés
**Forrásmezők:** `Waybill Number`, `LM Receive Date`, `Consignee city`, `Consignee zipcode`.

**Csoportosítás:** sorban `District / Település`; Budapesti címnél a négyjegyű 1xxx irányítószámból számított kerület, csak 1–23 lehet. Más településnél **az eredeti Consignee city szöveg** (pl. Szigetszentmiklós, Dunaharaszti), nem `31`/`33`. Hibás/hiányzó város vagy irányítószám blokkoló hiba, nem önkényes megfeleltetés.

**Oszlopok:** az `LM Receive Date` különálló napjai időrendben, `MM/DD/YYYY` megjelenítésben. Érték: `Waybill Number`-t tartalmazó csomagok darabszáma. A `Grand Total` sor- és oszlopösszegei egyezzenek a feldolgozott egyedi sorokkal. A kivonatban a duplikált Waybill blokkoló ellenőrzési hiba, nem csendes duplázás. A csomagazonosító szöveg marad; vezető nullát nem törlünk.

**Vizuális minta:** az eredeti PivotTable képernyőképéhez igazodó világoskék `#DDEBF7` fejlécek, 3. sorban `Count of Waybill Number` / `LM Receive`, 4. sorban terület és dátumok; jobb szélen Grand Total, alul világoskék végösszeg. Nulla előfordulás megjelenítése üres cellaként; az összeg helyes marad. Az automatikus generátor PivotTable-*szerű* táblát ad, nem szerkeszthető natív Excel PivotTable-objektumot.

## 3. DA OFD Monitoring — Sheet2-szerződés
**Forrásmezők:** `OFD Date`, `DA`, `DA Code`, `Vendor`, `Station`, `OFD`, `Delivered`. `District` a feltöltött exportban **nincs**: csak ellenőrzött napi hozzárendelésből vehető át, addig sárga `—`.

**Sorkulcs:** `OFD Date + Station + DA Code + Vendor`. Azonos kulcs többszöri nyers sora összegződik, nem két futár. Minden futárhoz nap, állomás, név, DA-kód, vállalkozó, OFD, kézbesített, Dld% és P90 Target kerül.

**Képletek:**
- `Dld% = Delivered / OFD` (nulla OFD-hez nem állítunk megbízható sikerességi arányt).
- `P90 Target = OFD × 0,90 − Delivered`; a negatív szám (már teljesített cél) megmarad a mintának megfelelően.
- Vállalkozói `Total OFD` és `DLD` a futárrekordok összege; `% = SUM(Delivered)/SUM(OFD)`, NEM a futárszázalékok egyszerű átlaga.
- `SPR = Total OFD / egyedi futárok száma` az adott nap, depó és vállalkozó csoportjában.
- A `Grand Total` az adott feltöltés tényleges dátumait és állomásait fedi; a 10:00 körüli napi export **pillanatkép**, nem automatikusan végleges napi KPI.

**Vizuális minta:** `A1:N1` sötétkék `#002060` összevont cím fehér szöveggel; `A2:N2` világoskék `#8AB8E6` fejléc. Sorrend: OFD Date, Station, District, DA, DA Code, Vendor, OFD, Delivered, Dld%, P90 Target, Total OFD, DLD, %, SPR. Futársorok világosszürkék `#E6E6E6`. A vállalkozóhoz tartozó K–N oszlopok cellái függőlegesen összevonva; a százalékos teljesítmény a képen látható színskála szerint piros `#D45D60`, sárga `#E7D67B`, halványzöld `#A8C375`, zöld `#5AAC6F`. **Jelenlegi staging színhatárok:** <60% piros, 60–<68% sárga, 68–<72% halványzöld, >=72% zöld; a pontos üzleti küszöbök jóváhagyásig QA-feltételezések, nem KPI-követelmények. Hiányzó kerület világossárga `#FFF2CC`.

## 4. Statisztikák és későbbi adatbázis-szerződés (még nincs aktiválva)
- A naponta kapott OFD-exportból egy előnézeti statisztikai pillanatkép épül a `date + station + DA Code` és vállalkozó attribútumokkal. Napi kézbesítési mennyiség, sikerességi arány, P90-cél, riportált munkanapok, időbeli trend, vállalkozói aggregátum és SPR.
- A `sourceBatch` azonosító forrásfájl hash-e, export típusa és riport állapota (`provisional` / `final`) szerint verziózott. Egyazon nap azonos snapshotjának újbóli feldolgozása **idempotens**, nem dupláz; az eltérő újrafeltöltés csak jóváhagyott verzióváltásként jelenhet meg, visszavonható és auditálható.
- A 10 órai export **provisional**, amíg a felhasználó nem jelöli véglegesnek. Napi/havi KPI döntésnél egyértelműen jelezni kell, hogy a mérési napok lefedettek-e, illetve hiányoznak-e napok.
- A futár- és vállalkozótörzs állapota változhat; az adott naphoz tartozó vendor snapshotot külön kell megőrizni. Belső role-based jogosultság és telephelyi hozzáférés kötelező.
- Későbbi szerveroldali staging API/Firestore tranzakcióban `(date, station, DA Code, sourceVersion)` egyszeri import; egyirányú, ellenőrzött adatátvétel, auditfeljegyzéssel. Nincs közvetlen import a Google Attendance / VEHICLE_Fuel_Database vagy éles Flotta rendszerbe.
- Az In-Hub napi kerület/település-összesítéseit is tárolhatjuk napi pillanatképként, de az ezekből számolt készlet- és öregedési trendek a *snapshot* keletkezési idejéhez kötöttek, nem a forrás szerveri hitelesítésének idejéhez.
- Előzetes kapu: vállalati adatkezelés, adatmegőrzés, jogosultsági Firestore-emulátor/race tesztek, rollback, beszállító-azonosság és hiteles napi District mapping jóváhagyása.

## 5. Biztonság és bevezetés
A fejlesztői ág kizárólag staging kód. A `main`, élő Flotta, Firebase Rules és Google forrástáblák nem módosulnak. Jelenleg a kliensoldali Excel-generáláshoz rögzített verziójú **külső QA JavaScript** töltődhet be: üzemi használat előtt azt saját, verziózott belső csomagba kell helyezni és függőség-/biztonsági ellenőrzést végezni, tehát a staging UI **csak mesterséges adatokra engedélyezett**. A képernyőképes pixelpontosság és teljes napos különféle exportminták E2E összevetése további QA-feladat.

**Továbbküldhető valódi Excel:** a beszélgetés során külön elkészítettük az eredeti In-Hub 2026-10-31 és OFD 2026-10-30 nyers mintákból, ellenőrzött helyi Excel-feldolgozással; ez nem bizonyítja a staging browser-változat teljes, üzemi alkalmasságát.
