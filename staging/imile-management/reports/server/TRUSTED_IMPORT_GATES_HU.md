# iMile Management – biztonságos riportmentés, szerveres ellenőrzés és teljes verzióarchívum

Állapot: **PR #12 fejlesztői ág / staging előkészítés. NEM publikált és NEM üzemi import.**

## Mi készült el a #12 fejlesztői ágon?

- `trusted-report-validation.mjs`: kizárólag szerveroldali, pontos mezőalakot és összegeket ellenőrző OFD/In-Hub validáló.
- Az OFD futár- és a raktári területi adatok aritmetikáját, egyediségét, dátumait és határértékeit a szerver újraszámítja.
- A kliens által megadott hash/role/verzió nem hiteles. A szerver maga képez determinisztikus SHA256-ot és tranzakcióval ír.
- A tranzakció minden módosításnál **teljes, visszakereshető riportverziót**, aktuális állapotot és auditrekordot készít.
- Régi kliensből származó állapot megőrizhető, de `legacy-unverified` jelöléssel.
- `report-http-api.mjs`: Firebase-ID-token ellenőrzést és visszavonás-ellenőrzést igénylő, pontos originre korlátozott, mérethatáros HTTP API:
  - `POST /v1/reports/save` – ellenőrzött, verziózott egyetlen nap/depó mentése;
  - `GET /v1/reports/current` – jelenlegi verzió lekérése optimista csere előtt;
  - `GET /v1/reports/version` – korábbi teljes riportverzió lekérése.
  - `POST /v1/reports/restore` – admin jogosultságú, kötelező indokkal és ismert jelenlegi verzióval működő, auditált visszaállítás; a régi archívum változatlan marad.
- `private-server-entry.mjs`: külön futtatható, alaphelyzetben **letiltott** privát Node/Firebase Admin kiszolgáló-belépési pont. Nincs csomagolva a Firebase Hostingba.
- `report-app.mjs`: megszűnt a közvetlen kliensoldali Firestore-riportírás. Kizárólag az engedélyezett API-n menthet; egyetlen nap/depó egységet kezel atomikusan. A korábbi verziót explicit jóváhagyással lehet javítani.
- `report-api-config.mjs`: az API URL alaphelyzetben üres. Ezért API-telepítés nélkül a mentés és történeti API-lekérdezés letiltott, **az Excel-riport készítése és letöltése továbbra is működik**.
- `depokapacitas/firestore.rules`: a hat riport- és verziógyűjtemény esetén minden közvetlen böngészős create/update/delete **tilos**; az aktív belső felhasználók olvashatnak.
- A meglévő, böngészőből készített staging rekordok nem jelenhetnek meg szerverileg ellenőrzött KPI-ként. A UI kizárja és külön számolja a `validationSource!='server-aggregates-only'` jelzésű rekordokat.

## Tesztek és forrásadat-határ

A CI szintetikus validációs, API, idempotencia, archive és Firestore-emulátoros jogosultsági teszteket futtat. Semmilyen valós csomag- vagy futárrekord nem kerül tesztelésre.

**Fontos:** a szerver jelenleg a beküldött részletes aggregátumok **belső következetességét** igazolja. Nem bizonyítja, hogy azok ténylegesen az eredeti iMile exportból keletkeztek. Ezt kizárólag jóváhagyott, független forrásadapter vagy a szerver által hitelesen feldolgozott nyers export alapján lehet majd igazolni.

A teljes verzióarchívum garantálja, hogy a korábbi `v1`/`v2` rekordok és futáradatok visszaolvashatók; az újabb változat nem írja felül őket. A visszaállító írás külön **admin** szerepkörhöz, konkrét indokhoz és ismert előző verzióhoz kötött szerveres műveletként már elkészült a fejlesztői ágon, de továbbra sem automatikus, és nincs telepítve.

## Automatizált kiadási ellenőrző

A `release-gate.mjs` tisztán olvasó, előkészítő ellenőrzés: nem indít
felhőszolgáltatást, nem módosít adatbázist, nem használ titkokat. Csak akkor
ad pozitív eredményt, ha a staging projekt/csatorna, a pontos HTTPS
kiszolgálói origin, az elkülönített szerveridentitás, az adatkezelési
és költségjóváhagyás, a verzióarchívum-visszaállítás, a Firestore-emulátoros
tranzakciók, a jogosultsági kapuk és a forrásadapter jóváhagyása külön-külön
igazolt. Alaphelyzetben minden hiányzó jelzés tilt.

A kiadási ellenőrzés nem helyettesíti a valódi jóváhagyásokat:
a környezeti jelzőket az üzemeltetésnek bizonyítékokhoz kell kötnie,
nem szabad pusztán `true` értékekkel megkerülni a kapukat.
A vizsgálatot helyi ellenőrzésként így lehet futtatni:

`node staging/imile-management/reports/server/release-gate.mjs`

A mai fejlesztésben nincs jóváhagyott, futó privát szerver, nincs
függetlenül hitelesített eredeti iMile export, ezért a telepítési kapu
**jelenleg szándékosan NEM teljesíthető**.

## Szigorú telepítési kapuk

1. Vállalati adatkezelési, adatmegőrzési és szerverüzemeltetési jóváhagyás. A futáradat személyes adat lehet; a szerverre küldött riportösszesítés is tartalmaz neveket és DA-kódokat.
2. Privát, hitelesített szerverhost; szolgáltatásfiók csak szerveroldalon, kötelező Firebase Auth/role-ellenőrzéssel. A `private-server-entry.mjs` futtatásához a kiválasztott környezetben telepített, auditált Firebase Admin SDK szükséges.
3. Felhős API-infrastruktúra telepítése (és esetleges költsége) csak külön engedéllyel. Nincs automatikusan beállított API URL, ezért a mentés fail-closed.
4. Server-only API E2E valós Firestore-emulátorral (nemcsak mockkal): párhuzamos mentés, replay, token visszavonás, 1 MiB dokumentumhatár, memória-/terheléskorlát, staging cross-origin böngészőpróba.
5. A jelenlegi, közvetlen kliensírható staging ruleset-et **csak az API-val és új klienssel együttesen** szabad leváltani, a korábbi konfiguráció biztonsági mentésével és rollback-tervvel.
6. A hat régebbi, 2099. márciusi szintetikus cloud tesztdokumentum adminisztratív kezelése külön dokumentált jóváhagyás legyen. Nem töröljük a régi riportokat titokban.
7. Valós, vállalatilag jóváhagyott In-Hub és OFD nyers exportminták számozott forrásfejléc-/dátum-/ID-kontraktus vizsgálata, az Excel letölthető színmintáival és a napi 10 órai provisional státusszal.

**Sem a GitHub `main`, sem az éles Flotta, sem az Attendance, sem a VEHICLE_Fuel_Database nem módosult. A jelenlegi `imile-qa` felület a korábbi kódot futtatja, amíg a #12 nincs bevezetve.**
