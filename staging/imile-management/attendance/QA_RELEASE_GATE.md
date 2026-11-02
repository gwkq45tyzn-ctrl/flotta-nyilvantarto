# Saját Attendance PWA – QA kiadási kapu, 2026-11-02

Alap: #37 `6845fa3c9b3dc93c4b68173184f1fc662c9fae9e`. Külön javító ág;
a staging ág, main, régi Flotta, felhős adatok és IAM nem változtak.
A két kizárt Google-táblát nem olvastuk, nem futtattunk hozzájuk szinkront.

## Valós staging: csak olvasó mérés

- `imile-management-staging`, Standard/Native Firestore, `europe-west3`.
- A publikált Firestore release 2026-11-01 18:06:59 UTC; SHA256
  `9cdb22ab1b5de03f5a04348464302c2d26a60dc4e51af6e19c866cdc9e12dd98`.
  Ebben még nincs saját `vehicleSessions` / futár-PWA szabály. Nem telepítettük át.
- GCS bucket-lista HTTP 200, nincs bucket. Firebase Storage bucket API HTTP 403;
  nincs Storage Rules-release. `billingEnabled:false`. Nem aktiváltunk szolgáltatást.
- Email/password aktív; két Auth-fiók, két aktív belső admin dokumentum;
  nincs `courierAccess`, nincs éles futárprovízionálás. A jelenlegi saját tárolóban
  3 jármű / 2 futár; a sessions/locks/napiterv gyűjtemények üresek. Csak darabszámok.
- A tartós Hosting-címen a saját Attendance útvonala valódi böngészőben 404.
- Névtelen Firestore járműlista-olvasás tényleges HTTP 403.
- IAM: változatlan owner, SDK-admin és rendszerügynök írási lehetőségek;
  ezek megkerülhetik a kliens Rules-t. Privát kulcsot nem olvastunk, nem hoztunk létre.

## Javított hibák

1. Immutable Storage képek retry-ját a korábbi upload újraírta volna: most az
   eredeti bájtokat ellenőrzi, azonos képet újrahasznál, eltérőt nem ír felül.
   Részleges feltöltés és elveszett válasz után folytatható; a check-in ID a retry-nál megmarad.
2. A korábbi Rules hét fájlnévvel, tényleges upload nélkül is engedett kiadást.
   Reprodukálva helyi emulátorban, javítva: kötelező, csak megbízott IAM-verifier
   által írható `photoReceipts/{uid}/sessions/{sid}/stages/{in|out}` igazolás.
   Egyik böngészős szerepkör – az admin sem – hamisíthatja. A tesztelt igazolás
   pontos UID/session/stage/7 útvonalhoz kötött, szerveridővel. Képútvonal nem bizonyíték.
3. A kliens tranzakciója a még nem létező session olvasásán elakadt; a Rules most
   engedi az üres ID get-jét, másik futár létező sessionjének olvasását továbbra is tiltja.
4. Kezdő km nem lehet a közös Flotta-utolsó érték alatt; inaktív törzsfutár nem
   vehet át autót aktív access dokumentum mellett sem. Visszavételkor a záró km
   és verziózott Flotta-járműrészlet ugyanabban a tranzakcióban frissül.
5. Kulcs-ládába helyezés, tisztasági megjegyzés és fizikai review-ellenőrzések
   szerveroldalon validált és megőrzött adatok. Problémás autó nem bulk-elfogadható;
   hiányzó autó/kulcs/ellenőrizetlen probléma esetén a lock nem törlődik.
6. Viewer visszavételi kezelőszervek tiltva; bejelentkezési aszinkron verseny
   védve. Offline állapot azonnal újrarajzolja a hitelességi kaput.
7. Saját kapacitásban a használatban és visszavételre váró autók külön számlálók.
   JPEG konverzió natív képkódoló fallbackkel; HEIC-re nem állítunk univerzális támogatást.

## Ellenőrzések és határuk

- 10 új immutable-upload és 10 új photo-proof eset; kibővített állapotgép/kapacitás tesztek.
- 43 Firestore own-PWA és 21 Storage saját/idegen/inaktív/staff próbát céloz a CI.
  A teljes CI kötelező a pontos PR-headre; a régi sikeres futás nem helyettesíti ezt.
- Valódi Chromium böngészőben, helyi Auth/Firestore/Storage-emulátorokkal,
  390×844 mobilméret és asztali nézet. Csak SYNTHETIC szereplők és generált PNG/JPEG.
  A HTML csak QA importmapet és hibainjektáló gombokat kap; a termékmodulok azonosak.
- A helyi fixture-verifier kizárólag tesztsegéd: hét ténylegesen feltöltött
  miniatűr képből ad emulátoros igazolást. Nem része a webcsomagnak vagy az üzemi
  backendnek, nem telepíthető valódi fotóellenőrzőként.
- Fizikai iPhone Safari, Android kamera, HEIC-dekódolás, PWA-telepítés és valódi
  lassú mobilhálózat jelen környezetben NEM ELLENŐRIZHETŐ. Hibainjektálás nem hálózati mérés.

## Kötelező fennmaradó döntések / kapuk

**DRAFT, DEPLOY TILOS.** A Rules prototípus; önmagában nem kész rendszer.

1. Tájékozott jóváhagyás Storage/Blaze költséghez, régióhoz, kvótához,
   adatmegőrzéshez és a félbehagyott feltöltések kontrollált kezeléséhez.
2. Jóváhagyott privát fotóverifier, minimális IAM-mel. Valódi képfájl-dekódolás,
   hét kötelező hely, UID/session/stage, MIME/méret, immutable objektumgenerációk
   és idempotens receipt szükséges. Kliens-metaadat vagy JPEG-fájlnév nem elegendő.
   Az IAM tárhelyíró/törlő a receipt után is módosíthatna képet: ezt korlátozni/auditálni kell.
3. Külön jóváhagyott Firestore/Storage Rules telepítés és futárfiók-hozzárendelés.
   Egy DA ne kapjon véletlenül több aktív személyazonosságot. Nincs közös futárjelszó.
4. Valódi staging végpont + fizikai telefonos kamera/HEIC/újrapróbálás teszt,
   majd szakaszos bevezetés. A régi Flotta-adatok változatlanok; nincs automatikus migráció.

Hivatalos háttér: https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024
