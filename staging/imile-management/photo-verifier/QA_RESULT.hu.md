# Fotóhitelesítő QA – 2026-11-02

Alap #53 `86107df4e7e56895e9e72656d508a63308b351ab`; külön draft javító ág.

## Helyben ténylegesen ellenőrizve

- 28 backend unit teszt: teljes JPEG-dekódolás/hash, hamis és hiányos képek,
  méret/MIME/metaadat, generáció, namespace, hiányzó fotó, retry, ismételt esemény,
  objektumcsere és visszavonás. Node 24 és a tervezett Node 22.23.4 alatt is sikeres.
- 20 receipt/nézegető teszt: tulajdonos/session/szakasz, szerveridő, manifest,
  aktuális generáció és tényleges SHA-256; letöltés közbeni csere sem jelenhet meg.
- 35 integrációs forgatókönyv valós Auth, Firestore, Storage és Functions
  emulátorral. Az igazi Storage-finalize handler állította ki az igazolást;
  metadata-update és delete eseménnyel vissza is vonta azt. Nem fixture backend.
  Két külön autó/futár 7+7 folyamata és két autó egyetlen atomi reggeli
  visszavétele is sikeres. Hiányzó kulcs/ellenőrizetlen sérülés/viewer/jogosulatlan
  courier nem oldhatott zárat; admin SDK csak szintetikus seedhez és tamper-teszthez.
- 8 célzott regressziós Node-tesztbejegyzés sikeres: meglévő változatlan fotóretry,
  kamerafájlok, szerverfrissesség, identitásváltás és viewer visszavételi UI-védelem.
- Az izolált preview webcsomag elkészült. Backend, függőségek és szabályok nem
  kerültek a 61 fájlos Hosting-allowlistbe. Cloud deployment nem történt.
- `npm audit --omit=dev --audit-level=moderate`: 0 ismert sérülékenység.
  A transzitív glob/minimatch rögzített javított verzióra felülírva;
  az Admin SDK tranzakcióit a valódi emulátoros teszt is futtatta.

## Valódi böngésző, helyi emulátorokkal

UI adapter csak a helyben kiszolgált HTML-ben: SDK-k loopback címekre kötve,
projekt `demo-imile-photo`, Storage a rögzített bucketnév helyi emulációja.
A GitHub termékkonfigurációja változatlan; nincs staging felhős írás.

1. Szintetikus futár valódi Auth-emulátoros belépése.
2. 390×844 mobilnézet: 390 px viewport / 375 px dokumentum, nincs vízszintes túlcsordulás.
3. A 4. képfeltöltés mesterséges megszakítása: `SYNTHETIC_UPLOAD_INTERRUPTED`;
   kiadás nem történt, az űrlap/fotók megmaradtak.
4. Újrapróbálás az eredeti képekkel: meglévő bájtok visszaellenőrizve,
   7 valódi JPEG után szerver-receipt, sikeres kiadás, `Használatban` állapot.
5. Újabb 7 fotó, 150→175 km és kulcsleadás: sikeres checkout;
   `Visszaadás ellenőrzésre vár`, autó továbbra is zárolt.
6. Belső editor asztali nézete: pontos várólista és 25 km bejelentett, még nem
   jóváhagyott növekmény; a nézegető mind a 14 hash/verzióellenőrzött képet megjelenítette.
7. Autó/kulcs/tisztaság külön visszaigazolásával sikeres reggeli visszavétel.
8. Teljes oldalújratöltés után 0 aktív/0 váró zár, 2 szabad digitális állapotú autó;
   összes szintetikus napi km 75 bejelentett / 75 visszaigazolt. Korábbi 50 km QA
   előzmény + e böngészős folyamat 25 km-e. Nem állítunk fizikai jelenlétet a zár hiányából.

Minden fenti végső ellenőrzés sikeres. A köztes tesztharness hibái (Node alatt
nem támogatott browser `getBlob`, Admin Timestamp átadása web SDK-nak, null/false
teszteltérés) javítva; ezek után a felsorolt végső tesztfutások sikeresek.

## Megmaradt mesterséges adatok

Kizárólag a helyi `demo-imile-photo` emulátorban: 4 Auth-fiók, 2 futár,
2 jármű és Fleet-részlet, 4 reviewed session, fotók és receipt-ek
(szándékosan visszavont tamper-receipt-ekkel), 0 birtoklási zár.
Egy hamis JPEG-ekből álló, elutasított szakasz is megmaradt a negatív tesztből.
Ezek nem valódi depóadatok és nem Firebase-felhőben vannak.

## NEM ELLENŐRIZHETŐ / blokkolt

Felhős privát bucket, valódi Eventarc/IAM, telepített PWA-szabályok, valós
futárfiókok, Android/iOS natív kamera, üzemi terhelés és felhős CORS még nincs
végponttól végpontig igazolva. Fizetős aktiválás, deployment vagy IAM-módosítás
nem történt. A kiadási terv és jóváhagyási feltételek: `DEPLOYMENT_GATE.hu.md`.
Korlátlan üzleti rollout előtt a session-feltöltések mennyiségi védelme is szükséges.

A teljes új GitHub CI tényleges eredménye a draft PR Checks felületén ellenőrizendő;
a helyi teszteredmény nem helyettesíti azt. A #53 korábbi sikeres CI-jét nem
állítjuk az új commit eredményének.
