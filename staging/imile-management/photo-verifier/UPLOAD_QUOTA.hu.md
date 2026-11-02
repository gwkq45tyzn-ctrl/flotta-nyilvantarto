# Szerveres feltöltési kvóta és engedély – kiadás előtti jegyzőkönyv

Pontos alap: #59 `d8ae8239176c5df4f4b6e9438f7910d7f1c0395c`;
alap CI `41422013947` SUCCESS, ellenőrizve. A munka eredetileg #58-on indult;
a két #59-es változó fájl új DA-/rendszámvédelmét és 27 Storage-tesztjét
megőriztük. Nincs main/staging merge, cloud deploy, billing/IAM változtatás,
valós adatírás vagy a két kizárt Google-tábla olvasása.

## Tényleges megoldás

- Egyetlen meglévő `photoReceipts` protokoll marad. Az új engedély nem fotóigazolás:
  csak 7 rögzített `in` és 7 rögzített `out` objektum létrehozását engedélyezi.
  A privát #54 JPEG-verifier, hash/generációs manifest, visszavonás és a
  hash-ellenőrzött fotónézegető megmarad; ezek nélkül továbbra sincs autókiadás.
- `attendancePhotoPermit` hitelesített callable, `europe-west3` régióban.
  A Firebase ID-token érvényessége, visszavonása és a fiók tiltása is ellenőrzött.
  A megbízható backend olvassa a saját `courierAccess`-t és a kanonikus futárt;
  kliens nem választhat UID-t, DA-t, napot, sessiont, szerepet vagy keretet.
- A session 128 bites `randomBytes` szerveres azonosító (`s_` + 32 hex).
  Az engedély UID/session/DA forráskötésű, két külön szakaszhatáridővel.
  Nem megosztható bearer URL vagy kliens által aláírt jogosultság.
- A napi UID- és kanonikus DA-számláló, az egyetlen függő DA-foglalás, az
  idempotenciabejegyzés, a ledger és az aktuális engedély EGY Firestore-tranzakció.
  Párhuzamos kérések újrapróbálása ugyanazt az állapotot olvassa; nincs külön
  kliensszámláló vagy read-then-write rés. A napot a szerver számolja Budapest szerint.
- A számláló új engedélyt mér. A visszaadás, ugyanazon feltöltés folytatása és
  hálózati újrapróbálása nem növeli. Másik UID ugyanazzal a DA-val sem kap új
  függő engedélyt; a napi DA-számláló fiókváltás után is megmarad.
- A PWA csak az idempotenciakulcsot tárolja a `sessionStorage`-ban, képet nem.
  Teljes lapújratöltés után az eredeti képek újbóli kiválasztásával folytatható;
  a meglevő JPEG-ek tényleges bájtjai/hash-e továbbra is egyezniük kell.
  Párhuzamos lapok ugyanazt a kanonikus sessiont kapják. A kéréskulcs-aliasok
  darabszáma is konfigurált és korlátos, így a napló sem növelhető korlátlanul.
- Lejárt rövid engedélyt a szerver ugyanarra a sessionre újít meg az abszolút
  folytatási időablakon belül. A végleg lejárt vagy visszavont kérés újrafuttatása
  hibát ad, nem vesz új kvótát. Új munkamenet csak tudatos újraindítással indulhat;
  a régi képeket nem írja felül, a már elhasznált keretet nem téríti vissza.
- Későbbi, még ténylegesen aktív autóhasználat checkoutja ugyanarra a sessionre
  kaphat új `out` időablakot. Ehhez a session, UID-zár, DA-zár és járműzár összes
  UID/DA/rendszám/session/állapot mezőjének egyeznie kell. Nem kap új napi keretet.

## Két dokumentumos Storage-határ és jogosultságok

Az aktuális, kizárólag szerver által írható képességmező:
`courierAccess/{uid}.photoUploadPermit`.

Storage create: első dokumentum `courierAccess/{uid}` (aktív hozzáférés, azonos
UID/DA/session, nyitott státusz, szerverforrás, szakasz szerinti lejárat).
Második dokumentum `in` esetén `courierLocks/{uid}`, `out` esetén
`vehicleSessions/{sid}`. A #59 saját/aktív session, DA- és rendszámellenőrzése
megmaradt. A Storage nem olvas harmadik zárdokumentumot. A teljes zárvizsgálatot
a szerver és a meglévő atomi Firestore-kiadás végzi.

Firestore ledger: `photoUploadPermits/{sid}`. Vezérlés:
`photoUploadQuotas`, `photoUploadLeases`, `photoUploadRequests`,
`photoUploadPolicy/current`, `photoUploadAdminOps`.
Ezeket egyik böngészős szerepkör sem írhatja, az admin sem. A futár csak a saját
ledgerét olvashatja, listát/számlálókat/adminnaplót nem. A böngészős admin az
eddigi `uid/driverId/active` hozzáférési mezőket továbbra is kezelheti, de az
engedélyt nem módosíthatja vagy törölheti egy teljes dokumentumcserével sem.
Az engedély aktuális állapota a szerver által ellenőrzött mező; a ledger csak
ellenőrizhető előzmény, nem külön párhuzamos jogosultságrendszer.

Az Auth-tiltás az issuerben azonnal ellenőrzött. A `courierAccess.active=false`
vagy a DA-átminősítés a Storage-ban is azonnal tilt. A kanonikus driver önálló
inaktiválását az issuer/verifier tiltja; a két olvasásos Storage ebben nem olvas
harmadik driverdokumentumot. Azonnali Storage-visszavonáshoz a hozzáférést is
inaktiválni vagy a függő engedélyt visszavonni kell. Maradék feltöltés egyébként
csak az előre engedélyezett, véges slotokra és a lejáratig lehetséges.

## Konfiguráció és adminisztrátori kivétel

Nincs automatikus, engedélyezett felhős alapkonfiguráció. Hiányzó policy esetén
`POLICY_NOT_CONFIGURED`, kikapcsoltnál `UPLOADS_DISABLED` a válasz.
A kódban levő minta szándékosan `enabled:false`:

```json
{"revision":1,"enabled":false,"uidDailyLimit":8,"driverDailyLimit":8,
 "permitTtlMinutes":120,"resumeHours":48,"maxAdminExtraPerDay":32,
 "maxRequestAliases":32}
```

A napi határok üzleti jóváhagyással 1–1000 között konfigurálhatók; a számok nem
fix termékkorlátok. A TTL 15–1440 perc, a folytatási idő 1–168 óra, az admin napi
többlet 0–1000, az aliasok 1–128 között állíthatók. A TTL nem lehet hosszabb a
folytatási időnél. A revision kötelező optimistic lock, kliensnap/időzóna nincs.

Csak aktív belső admin, élő szerveres szerepellenőrzéssel:
- `adminGrant`: mai UID ÉS DA többlet, konfigurált adminplafonnal, nincs refund.
- `adminResume`: ugyanazon függő session folytatási idejének naplózott megújítása.
- `adminRevoke`: függő engedély visszavonása, letiltott/inaktív fióknál is.
  Már létrejött autóhasználatot egyik kivétel sem írhat át vagy oldhat fel.
- `adminPolicy`: teljes validált policy, elvárt revisionnel. Bootstrapnél
  `expectedRevision:0`, `policy.revision:1`; további módosításnál revision +1.

Mindegyiknél `operationId` 32 hex és 10–500 karakteres indoklás kötelező.
Actor, cél-UID/DA, indok, időpont és előtte/utána értékek azonos tranzakcióban
kerülnek az adminnaplóba. Ugyanaz a műveletazonosító idempotens, eltérő
tartalommal nem használható újra. A PWA admin-only űrlap a három kivételt kezeli;
az issuer közvetlen meghívásánál is ugyanaz a szerepvizsgálat érvényes.

## Tesztelés

- 31 célzott unit/kontraktusteszt: policy/típusok, szervernap, kettős számláló,
  UID/stage/session, tartós újrapróbálási kulcs, kliensválaszok, két olvasásos
  útvonalak és a böngészős írás teljes tiltása.
- 60 teljes helyi Auth + callable Functions + Firestore + Storage forgatókönyv:
  hat párhuzamos kérés, duplikált DA-fiókok, utolsó DA-helyért versengő UID-k,
  kvótakimerülés, lejárat, megszakítás, 7+7 fotó, reggeli visszavétel, szerepek,
  naplózott adminműveletek és változatlan photoReceipts/JPEG-hitelesítés.
- 18 további emulátoros eset: újrabejelentkezés, hozzáférés/DA/szerep változása,
  teljes zárlánc hibái, abszolút lejárat és a letiltott fiók engedélyének visszavonása.
- A meglévő teljes staging CI megmarad, új kvótakapuval kiegészítve. A régi
  alrendszerek tesztfixture-jei csak szerveres engedélymezőt kapnak, hamis receipt
  továbbra sincs a verifier-tesztben. Az új kvótateszt MINDEN érvényes engedélyt
  valódi callable-en kér; nem használja a legacy permit fixture-t.
- Két további, valódi ideiglenes Git-repón futó CI-védelmi teszt: egy függetlenül
  előrelépett production/main nem számít e PR módosításának, de az e változtatásban
  érintett `index.html` vagy `features/` mindig leállítja az ellenőrzést.
  A kapu a PR tényleges base SHA-jához, staging pushnál a before SHA-hoz kötött;
  hiányzó/hibás kiindulásnál fail closed. A main tartalmát nem másoljuk a stagingbe.
- A preview csomag új kliensmodulját csomagoljuk. Backend/tesztfixture nem kerül a webbe.

Parancsok:
`node --test staging/imile-management/photo-verifier/quota-policy.test.mjs staging/imile-management/attendance/photo-permit.test.mjs staging/imile-management/attendance/upload-grant.integration.test.mjs`

`firebase emulators:exec --only auth,firestore,storage,functions --project demo-imile-quota --config firebase.photo-quota-emulator.json "node staging/imile-management/photo-verifier/quota-qa.mjs"`

Windows alatt forrásváltáskor a Functions worker régi modult tarthat meg;
a végső célzott ellenőrzés frissen indított workerrel, mentett szintetikus
emulátorállapotból történt. A kiegészítő teszt explicit megvárja a szabálybetöltést.
Ezek helyi harness-javítások; nem kerültek felhős szolgáltatásba.

## Felhős pilot kapuja – nincs végrehajtva

2026-11-02 10:48 UTC, csak olvasó CLI-hitelesítéses mérés:
`billingEnabled:false`, GCS bucket-lista HTTP 200 és 0 bucket; publikált
Firestore release továbbra is 2026-11-01 18:06:59 UTC, SHA-256
`9cdb22ab1b5de03f5a04348464302c2d26a60dc4e51af6e19c866cdc9e12dd98`.
Storage release nincs a listában. Cloud Functions lista HTTP 403, ezért a
telepített funkciók állapotát ebből NEM állítjuk ellenőrzöttnek. API-t nem engedélyeztünk.

Külön jóváhagyás kell: Blaze és költségkeret; privát frankfurti bucket/megőrzés;
szükséges API-k és cross-service Rules kapcsolat; két kulcs nélküli runtime SA
és minimális IAM; Rules, Functions és PWA staging telepítése; pilotfiókok és
explicit, verziózott üzleti kvótabeállítás. Nincs automatikus engedélyező seed.

Új issuer SA-terv: `attendance-photo-quota@imile-management-staging.iam.gserviceaccount.com`,
Auth users.get + Firestore tranzakcióhoz get/create/update és szükséges database
metadata + logging jog. Nincs Storage-írás, Auth-fiók- vagy IAM-módosítás.
Az Admin SDK-t a Rules nem korlátozza dokumentumszinten: ez megbízható
kódhatár, a runtime nem kaphat Owner/Editor vagy privát letölthető kulcsot.
A callable szállítása szükségképp kliensből elérhető, az Auth/jogosultságot a
szerver ellenőrzi; nem szabad a privát Eventarc-verifier nyilvánossá tételével összekeverni.

Ez új munkameneteket és eredeti képslotokat korlátoz, NEM teljes számlázási hard cap.
Meglévő engedély folytatása az eredeti kvótanapjához tartozik; admin kivétel
naplózott többletet engedhet. Egy session maximum 14×8 MiB eredeti kép.
Callable/Firestore olvasás, retry, régi verziók és letöltések külön költséget okozhatnak.
Valós pilot előtt App Check / hívásterhelési védelem, monitoring, régiós IAM/CORS
és terhelési próba szükséges; budget riasztás és maxInstances nem pénzügyi plafon.
Nincs automatikus objektum- vagy naplótörlés: megőrzés/árvatakarítás csak jóváhagyott
szabályzattal. Előkvótás aktív sessionöket bevezetés előtt le kell zárni vagy
külön jóváhagyott, ellenőrzött átállást tervezni; nincs csendes automatikus migráció.

Hivatkozások:
https://firebase.google.com/docs/functions/callable
https://firebase.google.com/docs/firestore/manage-data/transactions
https://firebase.google.com/docs/storage/security/rules-conditions

A Rules prototípus, a korlátozott pilot előtt külön felülvizsgálandó. A felhős
bevezetés nem tekinthető késznek a helyi tesztekből vagy a CI sikeréből.
