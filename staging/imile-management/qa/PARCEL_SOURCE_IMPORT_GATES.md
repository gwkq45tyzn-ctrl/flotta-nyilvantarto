# DepóKapacitás – valódi forrásadapter és szerveroldali egyediség: bevezetési kapuk

Állapot: **fejlesztői szerződés / biztonságos előkészítés**, NEM éles import.
Kiinduló staging commit: `24fda60e6a52af0bc863c628f11b3a5714fe96c0`.

## 1. Forrásismeret – még nem áll rendelkezésre

A valós export vagy API végleges oszlopfejléceit és eseményszemantikáját
nem kaptuk meg. A jelenlegi `parcel-preview.mjs` **mesterséges**
`date,trackingId,district,kind` oszlopokat kezel, a rendszám és km
az Attendance-ben még nincs bevezetve, és a kettőnek nincs köze az
alábbi csomagszintű importhoz.

**Nem vélelmezhető**:
- hogy melyik üzemi mező a tartósan stabil küldeményazonosító;
- hogy a címke kis-/nagybetűje és körülötte lévő szóköz jelentést hordoz-e;
- hogy a teljes nap vagy újraelosztás napja a rekordszintű dátum;
- hogy melyik mező és állapot jelenti az új, illetve újrakézbesítendő csomagot;
- hogy azonos küldemény több kísérlete milyen napon és kerületben értelmezhető.

## 2. Elkészült tiszta, olvasó adapter

`depokapacitas/parcel-source-adapter.mjs`

Nincs automatikus aliaskeresés és nincs alapértelmezett ID-normalizálás.
Kötelező, explicit és verziózott konfiguráció:
- `sourceSchemaId`: később jóváhagyott schema verzió (QA esetben szintetikus);
- `columns`: `date, trackingId, district, kind` értékekhez pontos
  forrásoszlop-nevek;
- `kindValues`: a valós forrásállapotok pontos `new` és `retry`
  megfelelői, átfedés nélkül;
- `identityMode`: `exact` vagy `uppercase`;
- `identityWhitespace`: `preserve` vagy `trim`;
- `districtMode`: `exact` vagy `uppercase`.

A bemeneti azonosítóknak **szövegnek** kell lenniük, hogy a kezdő nulla
ne vesszen el. A dátum jelenleg kizárólag explicit ISO `YYYY-MM-DD`.
Más dátumformátum csak jóváhagyott kiegészítő feldolgozóval jöhet.
Az adapter azonos napon és normalizált ID-n az ismételt azonos sort
egyszer számolja, különböző kerület vagy `new/retry` státusz esetén
az egész előnézet blokkolt. Nincs Firestore/Google write, sem automatikus
integráció a #5-ös jelenlegi előnézetbe, amíg a valós oszlopok nincsenek
megerősítve.

Az adapter eredményében `importAllowed:false` mindig érvényes.
A `preview` állapot kizárólag lokális szintetikus ellenőrzés, **nem**
üzemi forrásjóváhagyás. A `missing` állapot nem hiteles 0.

## 3. Szerveroldali nap + csomagazonosító egyediség – terv, még nem kód

1. Forrásgazda jóváhagyja a fenti mappinget, az üzleti azonosító
   stabilitását és adatkezelési/megőrzési szabályt.
2. Belső jogosultságú szerveroldali import API ellenőrzi a mapping
   és az importáló szerepkörét; kizárólag a saját iMile staging Firestore-ba ír.
   A Google Attendance, VEHICLE_Fuel_Database és az éles Flotta **csak olvasott**
   vagy egyáltalán nem érintett források.
3. Determinisztikus, kizárólag backend által képzett, stabil azonosító:
   nap + az ID jóváhagyott normalizált értékéből képzett biztonságos kulcs.
   A teljes csomagazonosító ne szerepeljen felhasználók számára olvasható
   dokumentumútvonalban. Ha HMAC szükséges, szerveroldali titkos kulcsot
   se frontendkódba, se GitHubba ne tegyünk.
4. **Egyetlen atomi szerveroldali tranzakció** ugyanarra a napi csomagra:
   a `parcelClaims/{key}` dokumentum hiányát/saját egyező történetét
   ellenőrzi, a foglalást létrehozza, és audit eseményt ír.
   Párhuzamos kérésnek nem lehet két különböző kerületre vagy `new/retry`
   kategóriába ugyanazt a napi csomagot elhelyeznie.
5. Egyenértékű ismételt kérést csak igazolt idempotenciakulccsal,
   változatlan lényegi mezőkkel szabad elfogadni. Eltérő adat
   `conflict/review` – **nem** csendes felülírás.
6. A teljes napi kerületi terv nem mutatható hitelesnek, amíg a teljes
   import nem commitálódott és az összes batch státusza nem igazolt.
   Nagy fájl több tranzakciója esetén részleges importot jelölni kell;
   nincs látszat-atomikusság több batch között.
7. Audit: forrás verziója, feldolgozási idő, szerveridő, felhasználó UID,
   batch és kérésazonosító, konfliktus/duplikáció, auditálható döntés.
   A nyers személyes adat és csomagazonosító megőrzését minimalizálni kell.
8. Jogosulatlan, viewer és külső felhasználó nem kap importáló szerverjogot.
   A Firestore Rules mellett **szerveroldalon** is szerepkör- és
   telephelyellenőrzés szükséges; admin/service-account jogosultság
   nem kerülhet nyilvános kliensbe.
9. Kötelező Firestore-emulátoros párhuzamos import / retry / race tesztek,
   jogosultsági és idempotencia-próbák, visszaállítási terv, naplózás,
   mobil/böngészős E2E, jóváhagyott staging adatkezelés, majd külön GO/NO-GO.

## 4. Következő konkrét adatgazda-döntés

Egy **személyes adat nélküli** valódi exportból csak a pontos fejlécek,
mezőtípusok és az üzemi állapotkódok kellenek, valamint az alábbi döntések:
- mi a hivatalos stabil tracking ID és a napi dátum meghatározása;
- a kis-/nagybetű és whitespace számít-e az ID-egyezésnél;
- ugyanazon napon a retry és new közti ütközést melyik üzleti
  folyamat rendezheti és ki hagyhatja jóvá.

Amíg ez nincs meg, a forrásadapter csak mesterséges ellenőrzésekre
alkalmas. **A szerveroldali import építését és az élesítést nem kezdjük
el találgatott forrásjelentéssel.**

## 5. Párhuzamos fejlesztési ágak

- `PR #6` – másnapi kerületi kapacitástervező: a régi
  `e49e175` alapról indult, jelenleg eltér a #5-ös staging ágtól;
- `PR #7` – erre épülő külön helyi csomaglista-ellenőrző felület;
- `PR #3` – későbbi Attendance rendszám/km logika, még nincs valós
  forrásadat, ezért nem importálható.

**Nem szabad automatikusan mergelni** a párhuzamos ágakat. Előbb
összehasonlítás, célzott konfliktusfeloldás, staging E2E és CI szükséges.
A GitHub `main`, éles Flotta és forrás Sheets érintetlen marad.
