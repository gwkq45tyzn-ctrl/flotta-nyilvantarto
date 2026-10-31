# Csomagelőnézet ↔ napi kerületi terv: izolált staging összehasonlítás

## Kiindulás és állapot

Kiindulás: `staging/imile-management-integration` @ `adc379047eb221883606a0ba199a29362ebad102`.

A #5 jelenlegi `parcel-preview.html` marad az egyetlen előnézeti
felület. A #6 előrejelző panel és a #8 tiszta forrásadapter megmarad.
A #7 teljes, automatikus fejléceket kitaláló vagy számokká alakított
tracking ID-ket elfogadó megoldását **nem** használjuk.

A `depokapacitas/parcel-demand-reconciliation.mjs` önálló,
adatbázis-/hálózatmentes függvény. Képes a #5 ellenőrzött csomaglista
és a #8 explicit mappinggel előállított QA-előnézet kerületi összesítését
összehasonlítani a kiválasztott naphoz tartozó `demands` rekordokkal.

## Garanciák

- **Nincs adatírás**: `writesAllowed:false`, `authoritative:false`
  minden kimenetben. A `preview-match` nem jelent kész importot,
  visszaigazolt ügyfélforrást vagy jóváhagyott üzleti adatot.
- A kiválasztott ISO-nap kötelező. Más napi aggregátum nem kerül át.
- A szerveri `assessSources()` állapot csak `ready/trusted` és
  ismert `confirmedAt` mellett enged összehasonlítási eredményt;
  cache, offline, error, loading, stale, pending esetben nincs
  hitelesnek tűnő részeredmény.
- Hiányzó csomaglista és hiányzó napi demand **ismeretlen**, nem 0.
  A tervben szereplő explicit `0+0` érték csak akkor hasonlítható
  össze, ha valóban van ugyanarra a kerületre csomaglista-adat.
- Tervben ismétlődő kerület, hibás/negatív/nem egész
  `newCount` vagy `retryCount`, valamint hiányzó tervsor
  külön állapotot kap, nem látszat-egyezést.
- Az eredmény kerületi számokat, státuszokat és darabszámeltéréseket
  tartalmaz, **tracking ID-ket nem**.
- A kerületek és a települések egyezése nem találgatás. A
  `districtMode` kötelező, és egyelőre `exact` vagy a jelenlegi
  #5 prototípus `legacy-preview` konvenciója választható.
  Nem budapesti településneveket tilos önkényesen numerikus
  "kerület" kóddá konvertálni.

## Bevezetési kapuk

1. Jóváhagyott, verziózott valós fejléc és napi dátum + tracking ID
   szemantika, új/újrakézbesítési állapotkódok és kerület/település
   megnevezési szabályok.
2. A #8 adapteren keresztüli, *kizárólag read-only* kliens oldali
   feldolgozás, azonos helyi előnézetben; a manuális #5 teszt-CSV
   fallback nem válhat hallgatólagos üzemi importcsatornává.
3. Friss, szerverileg visszaigazolt `demands` pillanatkép,
   kliensoldali cache/pending/error/stale kezelés és jogosultság
   egyedi UI- és jogosultsági E2E tesztekkel.
4. Szintetikus folyamat E2E: egyezés/eltérés, hiányzó forrás,
   kétféle dátum, településnév, duplikált plan, ütköző parcel ID,
   bejelentkezés nélkül tiltás és mobil 390px.
5. A szerveroldali `date+tracking ID` egyszeri, auditált
   tranzakciós import **külön** fejlesztés; jelenleg sem
   fejlesztve, sem engedélyezve nincs.

**Nincs deployment vagy production merge ebben a munkafolyamatban.**


## #9 felületi előkészítés – csak mesterséges QA

A meglévő parcel-preview.html ugyanazon az oldalon kapott egy QA-panelt. Kizárólag hét beépített forgatókönyv hoz létre mesterséges csomaglistát és tervet: egyezés, eltérés, hiányzó terv, duplikált terv, hiányzó csomagkerület, csomagütközés, nem hiteles forrás. A lista ugyanazon previewParcelImport feldolgozón és eredménynézeten halad át. A kézzel megadott vagy feltöltött tartalom nem továbbítható a comparatorba. Az eredmény és a szimulált forrásállapot feltűnően QA-jelölésű. Nincs Firestore demands-lekérdezés vagy írás ebben az új folyamatban; az eredeti belső Auth/profile olvasás változatlan. Aktív admin/editor/viewer láthatja, jogosulatlan/inaktív felhasználó nem.

Bemenet-, dátum-, formátum- vagy forgatókönyv-váltás, illetve Auth-változás elrejti az elavult összehasonlítást. A #5 normál előnézeti exportja nem exportál összehasonlítást vagy üzemi hitelesítést. A #6 előrejelzőt és a source-health logikát nem módosítottuk. Az adapter továbbra sincs bekötve valós exporthoz. A hiányzó csomagkerület az összesített previewNew/previewRetry értékeket is ismeretlenné teszi, nem részösszeget mutat teljesként.

## Még szükséges konkrét adatgazda-döntések

1. Pontos, verziózott export/API szerződés: oszlopnevek, típusok, kódolás, formátum, fájl-/sorkorlát, kötelező/elhagyható mezők. Puszta fejléc-hasonlóság nem jóváhagyás.
2. Melyik mező az állandó csomagazonosító; újracímkézés, több csomagrész és több kézbesítési kísérlet hogyan különül el? A tracking ID szöveg marad, kezdő nullával.
3. Azonosítók kis-/nagybetűje, szóközei és karakterei jelentéshordozók-e; exact/uppercase és preserve/trim közül melyik a jóváhagyott? Addig nincs valós default.
4. A napi dátum jelentése: tervezett kiszállítás, depóba érkezés vagy eseménynap? Időzóna, napi zárás, másnapra vitt csomag, késve érkező javítás és jövőbeli rekord kezelése.
5. Pontos forrásstátusz → new/retry megfeleltetés, átfedés nélkül. Mi történjen törölt, visszavont, már kézbesített vagy több eseményes csomagnál?
6. Kerület/település/körzet azonossága, telephely, aliasok és kerületváltás jóváhagyott szabálya. Nem Budapest numerikus kóddá alakítása tilos automatikusan.
7. A fájl teljes napi állomány vagy részhalmaz/delta? Hogyan igazolható a teljesség, és mikor jelent valóban nullát a hiányzó sor? A QA nem következtet nullára.
8. Hiteles forráskeletkezési idő, maximális elfogadott késés, forrásverzió és hibajelzés. A Firestore szerveri visszaigazolás önmagában nem a fájl frissessége.
9. Ki jogosult olvasni és jóváhagyni a terveltérést, mely telephelyre? Adatminimalizálás, nyers ID-k/állományok tárolási és törlési szabálya, audit és felelős adatgazda.
10. Eltérés/konfliktus esetén kézi döntési folyamat; melyik forrás elsődleges, ki javíthat és hogyan verziózott az újraszámítás? Nincs automatikus felülírás.

Következő fejlesztés: a jóváhagyott verziózott kontraktussal a #8 explicit adaptert az egyetlen előnézethez kötni, majd jogosultsággal olvasott, friss demands-pillanatképpel összehasonlítani és mobil/desktop E2E-ben tesztelni. Továbbra is csak olvasás; tényleges import külön szerveroldali egyediségi/tranzakciós/audit feladat.
