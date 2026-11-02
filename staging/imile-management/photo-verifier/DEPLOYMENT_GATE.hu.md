# Privát Attendance fotóhitelesítő – jóváhagyás előtti kiadási kapu

Alap: #53, `86107df4e7e56895e9e72656d508a63308b351ab`.
Ez kód és helyi QA, nem felhős telepítés. Nem változott main, közös staging ág,
Firebase-adat, IAM, számlázás vagy a régi Flotta. A két kizárt Google-táblázatot
nem olvastuk; nincs hozzájuk kapcsolódó új adapter vagy szinkron.

## Elkészült szerződés és biztonsági határ

- Egyetlen, meglévő `photoReceipts/{uid}/sessions/{sid}/stages/{in|out}` protokoll.
  A `source: storage-verifier-v1`, `paths`, `verified`, `verifiedAt` megmarad;
  új `manifestVersion: 1` és 7 elemű `objects` manifest kerül mellé.
- Három privát Storage-eseménykezelő: finalize, metadata-update, delete.
  Nincs publikus HTTP/callable végpont, kliens által beküldött igazolás vagy URL.
  A telepítéskor az Eventarc-hívó kapjon kizárólagos Run invoker jogot; sem
  `allUsers`, sem `allAuthenticatedUsers` binding nem megengedett.
- Csak a rögzített staging bucket és a Work #47 útvonala fogadható el.
  A tényleges Auth-fiók létezését/tiltását, aktív courierAccess-t, kanonikus
  futárt, session-t és a kiadáskor/visszaadáskor szükséges három zárat vizsgálja.
  A bejövő szakaszban még NINCS session: azt a PWA csak a receipt után hozza létre.
- Hét eredeti tárhelyobjektum valódi metaadata, 1 bájt–8 MiB mérethatára, JPEG MIME-ja,
  tömörítetlen HTTP-tartalma, generációja és metagenerációja ellenőrzött.
  A letöltés generációhoz kötött, CRC32C-ellenőrzött és stream közben is korlátos.
  SHA-256 és teljes Sharp/libvips JPEG-pixeldekódolás történik, nem csak fejlécpróba.
  A dekódolási korlát 40 millió pixel; a képek sorban dolgozódnak fel.
- A manifest eredeti generációja sztring marad, így nincs 53 bites kerekítési hiba.
  A hét élő objektum a dekódolás után ismét ellenőrzött. A receipt létrehozása
  Firestore-tranzakció, ismételt jogosultság/session/zár ellenőrzéssel, create-only.
  A párhuzamos/ismételt események nem cserélik a manifestet és nem újítják az időpontot.
- Hiányzó fotónál még nincs receipt. Átmeneti infrastruktúrahiba retry-t vált ki;
  a PWA meglévő változatlan, bájtpontos újrafeltöltési eljárása megmaradt.
  Hamis JPEG, más felhasználó/session, inaktív/letiltott fiók nem kaphat igazolást.
- Egy már hitelesített objektum cseréje, metaadat-módosítása vagy eltűnése
  visszavonja a receipt `verified` állapotát; a régi manifest megmarad.
  A böngésző a fotót csak friss szerver-receipt, kétoldali generációellenőrzés és
  tényleges SHA-256 egyezés után jeleníti meg. Lecserélt képet nem helyettesít be.
- A fotó tartalmi hitelessége itt fájlintegritást jelent: nem bizonyítja, hogy a
  felvételen valóban a kiválasztott autó van vagy a kép most készült. Nincs OCR/GPS/AI.
- Storage és Firestore között nincs elosztott atomi tranzakció. Az objektumok
  utolsó ellenőrzése és a receipt commit közti rés csak szigorú IAM-mal és
  megőrzési szabályzattal védhető. Owner/root/IAM író ellen abszolút garancia nincs.
  A böngészőcsere tiltott; IAM-es csere esetén eseményalapú visszavonás és olvasáskori
  ellenőrzés működik. Az Eventarc késleltetése nem nulla. Ezért a minimális IAM és
  a bucket-védelem kötelező telepítési feltétel, nem elhagyható optimalizálás.

## Tényleges staging állapot, 2026-11-02 07:20–07:22 UTC

Csak olvasó Firebase/GCP API-k, meglévő CLI-munkamenettel; nem készült új kulcs.
Személyes adatot tartalmazó metaadatmentés helyben, a privát backup könyvtárban van.

| Elem | Eredmény |
|---|---|
| Projekt | `imile-management-staging` |
| Firestore | Standard, Native, `(default)`, `europe-west3` |
| Számlázás | `billingEnabled: false` |
| GCS bucket-lista | HTTP 200, 0 bucket |
| Firebase Storage bucket API | HTTP 403 PERMISSION_DENIED; ebből önmagában nem állítunk bucketlétezést |
| Publikált Firestore release | 2026-11-01 18:06:59 UTC, nincs saját vehicleSessions/PWA-rendszer |
| Publikált Rules SHA-256 | `9cdb22ab1b5de03f5a04348464302c2d26a60dc4e51af6e19c866cdc9e12dd98` |
| Storage release | nincs a release-listában |
| Auth | Email/Password aktív, jelszó kötelező; 2 fiók |
| Belső jogosultság | 2 aktív admin dokumentum; aktív courierAccess 0 |
| Saját PWA esemény/zár/terv | mind 0; nem hoztunk létre felhős tesztadatot |

A tartós Attendance útvonal korábbi mérése 404 volt; ez nem az új backend
telepítése. A legújabb kód nincs felhőben, felhős végponti QA nem állítható sikeresnek.

## Javasolt telepítés – mind külön jóváhagyás után

1. Blaze/számlázási keret és adatgazdai megőrzési döntés jóváhagyása.
   Storage-hoz a Firebase aktuális követelménye szerint Blaze szükséges.
2. A meglévő projekten belül Frankfurt `europe-west3` Standard Storage,
   ugyanitt Functions v2 / Node 22 és a már itt lévő Firestore.
   Bucketnév a rögzített `imile-management-staging.firebasestorage.app`;
   ha ez nem foglalható, a kliens és a backend egyetlen kontraktusát együtt kell átírni.
3. Privát bucket, public access prevention, CORS csak jóváhagyott Attendance
   originre; nincs nyilvános ACL, megosztott letöltési URL vagy aláíró kulcs.
   A Firebase-kliens jogosult olvasása és a cross-service Rules hozzáférés valós
   stagingben külön ellenőrizendő, a bucket IAM-mód választásával együtt.
4. Külön, kulcs nélküli runtime SA:
   `attendance-photo-verifier@imile-management-staging.iam.gserviceaccount.com`.
   A kód ezt használja, nem hozza létre és nem oszt neki jogot.
   Egyedileg megállapított custom role: `storage.objects.get` csak e bucket
   attendance prefixén; `firebaseauth.users.get`; Firestore tranzakcióhoz
   `datastore.entities.get/create/update` és szükséges database metadata jog;
   `logging.logEntries.create`. Nincs Storage create/update/delete/list, nincs
   Auth user-létrehozás, token-aláírás, IAM admin vagy Owner/Editor.
   Firestore IAM nem ad mező/dokumentumszintű Rules-védelmet az Admin SDK-nak:
   a runtime kód csak photoReceipts-et ír, a dedikált identitás bizalmi határ.
   A custom role pontos engedélyeit telepítés előtti IAM tesztben véglegesíteni kell.
5. Külön Eventarc trigger-identitás: eventReceiver + e három Run szolgáltatás
   invoker joga. GCS service agent Pub/Sub publisher és a deployment/build
   service agent jogai külön ellenőrizendők. A deployer kapjon csak a szükséges
   build/deploy + SA actAs jogot; futár/belső fiók nem kaphat receipt-író IAM-ot.
6. A Work #47 Firestore/Storage rules telepítése jóváhagyott staging ablakban;
   a Storage Rules Firestore-olvasásához szükséges szolgáltatásügynök-hozzáférés
   külön IAM-jóváhagyás. A mostani változás nem módosította e szabályfájlokat.
7. Functions kód csak e három Attendance-eseménykezelőként; privát invoker
   ellenőrzés tényleges IAM policy alapján. Nincs automatikus deploy workflow.
8. Két szintetikus futár és egy belső QA-fiók jóváhagyott létrehozása,
   majd valódi mobilos 7+7, retry, negatív szerepkör és IAM-oldali integritás-QA.
   Csak ezek után korlátozott üzleti pilot, külön engedéllyel.

### Korlátok és adatmegőrzés – javaslat, nincs aktiválva

- Kód: 8 MiB/fotó, 7 fotó/szakasz, 14/eseménypár; 40 MP dekódolási plafon.
  PWA maximum 1600 px hosszú oldalra konvertál és EXIF-et eltávolít.
  Functions: 1 CPU, 1 GiB, concurrency 1, minInstances 0, maxInstances 2
  **kezelőnként** (három kezelő), 120 s; retry bekapcsolva.
- A maxInstances nem költségplafon. A mostani Storage Rules az aktív futár
  új session-prefixeinek darabszámát nem korlátozza. Korlátlan üzleti bevezetés
  előtt szerver által engedélyezett feltöltési keret / visszaélés-védelem szükséges,
  a meglévő photoReceipts megtartásával. Addig csak zárt, 2 fiókos szintetikus pilot.
- Javasolt pilot tárhelyfigyelmeztetés 1/2/5 GiB-nál, napi objektum- és hibaszám,
  számlázási riasztás 5/15/30 USD-nál, név szerinti leállítási felelőssel.
  Ezek riasztások, nem fizikai tárhely- vagy számlakorlátok. Most nem lettek beállítva.
- Szintetikus QA-fotó 7 nap; üzleti fotó 30 nap csak adatgazda/adatvédelmi
  jóváhagyás után. Sérülési ügy külön megőrzési döntés. Versioning és 7 napos
  soft delete javasolt; régi generációk teljes élettartamát és számlázását is tervezni kell.
  Bucket retention lockot ne kapcsoljunk be visszafordíthatatlanul.
  Lifecycle csak jóváhagyott namespace/revízió után. A lejáró fotóhoz tartozó
  receipt visszavont lesz; session és kilométer-előzmény nem törlődik automatikusan.
  Árva, félbehagyott szakaszok takarítása csak owner által jóváhagyott lejárattal.

### Költségbecslés, nem ajánlat és nem számlázási jóváhagyás

Feltételezés: 100 futár, 30 használati nap/hó, 14 kép/nap, átlag 0,5 MiB/kép,
30 nap élő megőrzés. Ez 42 000 új objektum és kb. 20,5 GiB élő állomány.
A kemény 8 MiB felső mérettel ugyanez 328 GiB. Régi generációk/soft delete plusz.

- Tervezési tartalék Storage-ra 0,02–0,04 USD/GiB-hó: átlagos állomány
  kb. 0,41–0,82 USD/hó, maximális képmérettel 6,56–13,12 USD/hó.
  Ez sávos becslés, nem ellenőrzött frankfurti SKU-ajánlat.
- 42 000 create Class A művelet nagyságrendileg 0,21 USD a publikált
  0,005 USD/1000 regionális Standard mintadíjon. A 7 kép minden finalize-esemény
  idején újra vizsgálható; a Class B olvasások és retry-k többszörözhetik a műveleteket.
- 20,5 GiB internetes képletöltés a publikált 0,12 USD/GiB mintadíjon kb. 2,46 USD;
  ismételt nézegetés többször ennyi lehet. A letöltés forgalmi díja nem zéró.
- Konzervatív 42 000 hívás × 15 s × (1 CPU + 1 GiB) becsléssel a Cloud Run
  publikált request-based alap mintadíjain kb. 16,70 USD/hó számítási költség
  keletkezhet ingyenes keretek előtt. Ez felső tervezési példa, nem benchmark.
  Firestore, Pub/Sub/Eventarc, naplózás, Artifact Registry/build és áfa külön tétel.
  Zárt pilothoz ezért 30 USD havi tervezési keret javasolt, nem garantált maximum.

Árak/architektúra forrásai, ellenőrizve 2026-11-02:
- https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024
- https://cloud.google.com/storage/pricing
- https://cloud.google.com/run/pricing
- https://cloud.google.com/eventarc/pricing
- https://firebase.google.com/docs/functions/gcp-storage-events
- https://firebase.google.com/docs/functions/retries
- https://docs.cloud.google.com/storage/docs/request-preconditions
- https://sharp.pixelplumbing.com/api-constructor/
- https://sharp.pixelplumbing.com/api-input/#stats

## Ellenőrzés és újrafuttatás

`npm ci --prefix staging/imile-management/photo-verifier --no-audit --no-fund`

`node --test staging/imile-management/photo-verifier/verifier.test.mjs`

`node --test staging/imile-management/attendance/photo-proof.test.mjs staging/imile-management/attendance/photo-integrity.test.mjs`

`firebase emulators:exec --only auth,firestore,storage,functions --project demo-imile-photo --config firebase.photo-verifier-emulator.json "node staging/imile-management/photo-verifier/emulator.test.mjs"`

A teszt demo projektet, kötelező loopback végpontokat és mesterséges képeket használ.
Nincs fixture-receipt-gyártó: a hét képet a valódi Functions-emulátor eseménye
ellenőrzi a fenti runtime kóddal. A korábbi sikeres 29 UI-csoportot nem ismétli.
A teljes meglévő CI megmaradt, az új tesztek hozzáadva; Hosting/Firestore deploy
nem fut új draft PR-en. A backend és node_modules nincs a webcsomag allowlistjében.

Következő konkrét lépés: a zárt szintetikus felhős pilot költség-, megőrzési-,
bucket-, SA/IAM-, Rules- és deployment-jóváhagyásának együttes beszerzése, majd
valódi staging végponti teszt. Enélkül a kód felhőben nem tekinthető bevezetettnek.
