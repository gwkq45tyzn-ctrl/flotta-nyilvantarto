# iMile Management – egyetlen napi irányítópult (staging követelmény)

## Vezetői cél

A depóvezető egyetlen iMile Management kezdőképernyőből lássa a napi, másnapi és közelgő operatív teendőket. Nem szükséges külön megnyitni a Flotta Nyilvántartót a figyelmeztetések kereséséhez. Minden figyelmeztetés érintett rendszámmal/futárral, tényleges dátummal, forrással, sürgősséggel, szükséges intézkedéssel jelenjen meg. Az eredeti, éles Flotta teljes integrációja külön bevezetési kapu.

## Fejlesztési állapot

A staging `depokapacitas/app.js` most feliratkozik a közös `fleetRecords` és `fleetAssignments` Firestore adatokra, ugyanúgy mint a `drivers`, `vehicles` és `bookings` gyűjteményekre. A `staging/imile-management/central-alerts.mjs` csak olvasó, determinisztikus figyelmeztetésgyűjtő; ugyanazt a `fleet/operations-data.mjs` `expiryWarnings()` szabályt használja, mint a staging Flotta. A kezdőképernyő első nyolc, a beosztási oldal első öt figyelmeztetést mutatja, az `Összes teendő` oldal pedig a teljes staging listát; a felhasználó a Flotta műveleti rekordjaihoz is eljuthat. A hibás vagy még hiányzó Firestore-adatforrásoknál nem szabad „minden rendben” állapotot mutatni.

A támogatott staging Flotta-jelek: kötelező, casco, műszaki, bérlet, következő szerviz (legfeljebb 60 nap), tankolókártya és jogosítvány lejárata, tervezett szervizrekord, szervizben/leállítva lévő autó, ütköző szerviznapos foglalás, mai kiadott autó és más futárnak tervezett foglalás közötti eltérés.

**Az éles, eredeti Flotta Nyilvántartó adatai még nem szinkronizálódnak automatikusan a staging Firestore-ba.** A fenti lista ezért nem bizonyítja az éles depó minden figyelmeztetésének meglétét/hiányát. A teljes CI, Firebase Hosting és böngészős teszt nem igazolt ezektől a forráskód- és szintetikus tesztektől.

## A végleges közös napi teendőlista további forrásai

- **Flotta:** szervizidőpont, hosszabb leállás, szabad/kiadott/ellenőrizetlen jármű, műszaki, biztosítás, casco, bérlet, tankolókártya, jogosítvány, jármű állapotkonfliktus.
- **Kapacitás:** holnapi csomag-előrejelzés, kerületenként hiányzó futárkapacitás, előre nem igazolt vállalkozói létszám, alacsony diáklétszám, ütköző futár-/autófoglalások.
- **Jelenlét:** hiányzó vagy késői becsekkolás, kifutó műszak, össze nem egyeztethető státuszok – csak ténylegesen meglévő adatokból.
- **Depócsomag-folyamat:** raktárban visszamaradt, futárnál túl régóta lévő, ismételt sikertelen kézbesítésű csomagok, nyitott ticketek, nem frissülő küldemények – csak később engedélyezett tényleges csomagadat-kapcsolattal.
- **KPI:** 12H Pickup, 24H OFD, 36H Delivered, P90, Pending OFD figyelmeztetések; hiányzó vagy késő forrás esetén nem szabad sikeresnek mutatni a mutatót.

A napi teendőnek a forrásrekord és a teendőazonosító alapján stabilnak kell maradnia. Az értesítés kézi megtekintése nem jelenti automatikusan a hiba megoldását; az adatforrásban elvégzett intézkedés után frissüljön az állapot. Ha később külön feladatnyilvántartás készül, azt a **saját iMile adatbázisába** mentsük, megfelelő jogosultsággal és naplózással.

## Adatforrások változtathatatlansága

- **iMile Driver Attendance - Log In Out:** kizárólag olvasható. Nincs új mező, űrlap, sor vagy képlet az eredeti dokumentumban.
- **VEHICLE_Fuel_Database:** kizárólag olvasható. Nincs visszaírás vagy forrásmódosítás.
- **Éles Flotta és GitHub `main`:** változatlanul kell maradjon, amíg a felhasználó külön jóvá nem hagyja az élesítést.
- A staging Flotta-jegyek és saját foglalások/teendők a saját Firestore-gyűjteményeiben élnek. A Firebase realtime csak ezekre vonatkozik, nem a két külső Google Sheets közvetlen élő változásaira.

## Következő élesítési kapuk

1. Az éles Flotta teljes figyelmeztetésforrásának **csak olvasó** migrációja vagy biztonságos szinkronja (nem közvetlen átírás).
2. Közös stabil figyelmeztetésazonosítók, priorizálás, feladatszűrés dátum/telephely/súlyosság szerint, ütközések deduplikációja.
3. Források utolsó sikeres frissítési ideje, késés-/hibaállapot, adatfrissesség-miatti figyelmeztetés.
4. Valós csomag- és vállalkozói források feltérképezése jogosultsággal; üres adatbázis ne legyen zöld KPI.
5. Staging Firestore Security Rules és E2E teszt; élő Firebase Hosting staging ellenőrzése, éles adatokat és főágat nem érintve.
