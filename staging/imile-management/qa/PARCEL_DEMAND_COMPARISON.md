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
