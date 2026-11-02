# App Check, híváskorlát és #61 pilot kiadási kapu

Kiindulás: PR #60, `7fe729528c5cf1900f8fedadaa60d36cc98dafc1`.
Ez külön, függő Draft fejlesztés. Nincs merge, cloud deploy, IAM-módosítás,
API-aktiválás, számlázásváltás vagy valós Firebase-adatírás.

## Megvalósított védelmek

- A callable `enforceAppCheck:true`; a handler az Admin SDK-val ismét ellenőrzi
  az igazolást, és kizárólag a meglévő staging webalkalmazás app ID-ját engedi.
  A Firebase Auth token visszavonását/letiltását is ellenőrzi.
- A Functions emulator App Check-dekódolása önmagában nem hitelesítés.
  A QA-futtató memóriában generál egyszer használatos RSA-kulcspárt, helyi
  szintetikus JWT-ket ad a valódi Web SDK CustomProviderének. A backend a
  szignatúrát, appot, projektet, kibocsátót és lejáratot is ellenőrzi.
  Ez nem Google-attestáció és nem felhős Firebase debugtoken.
- A helyi nyilvános kulcs csak `demo-imile-quota`, Functions-emulátor és
  loopback Auth/Firestore mellett fogadható el. Production módban a tesztkulcs
  konfigurációja is elutasítást okoz. Privát kulcs nem kerül fájlba/GitHubra.
- Az Attendance a normál App Check Web SDK Enterprise providerét készíti elő.
  A nyilvános site key szándékosan üres: jóváhagyott regisztráció nélkül nincs
  fotóengedély-kérés. A belépés és a csak olvasó felület használható marad.
  A helyi QA CustomProvider csak fejlesztői importmapben szerepel, nem a
  publikálható webcsomagban.
- A hívás elé korlátos memóriájú, példányonkénti terhelésleválasztó került.
  A párhuzamos folyamatok száma legfeljebb 10; a processz újraindulása ezt
  nullázza, ezért ez nem globális kvóta.
- A `photoPermitSecurityPolicy/current` explicit, megbízható backenddel
  konfigurálandó. Hiányában a callable zártan leáll.
  Példa, még nem jóváhagyott értékek:
  `{"revision":1,"uidPerMinute":60,"uidBurst":10,"daPerMinute":90,"daBurst":15}`.
  Egész értékek 1–10000 között, a revision 1–1000000 között.
- Firestore-tranzakció egyszerre terheli a UID és a kanonikus DA token bucketet
  a `photoPermitCallLimits` kollekcióban. Másik aktív fiók ugyanazzal a DA-val
  ugyanazt a DA-korlátot használja. A tranzakció egyik számlálót sem módosítja,
  ha a másik nem enged. Aktív belső admin/editor/viewer UID-k külön UID-korlátot
  kapnak; a műveleti szerepkört továbbra is a meglévő kvótaszolgáltatás ellenőrzi.
  A kliens egyik új kontrollkollekciót sem olvashatja/írhatja (meglévő deny-all).
- Az idempotens újrapróbálás továbbra sem fogyaszt új napi feltöltési kvótát,
  de minden beérkező próbálkozás számít a hívásterhelési korlátban.
  A 7+7 fotó, eredeti generáció/hash, photoReceipts, zárak, kivétel/audit és
  reggeli visszavétel meglévő protokollja változatlan.
- Saját naplózás csak rögzített eseménykódot használ; nincs JWT, képtartalom,
  e-mail, fájlútvonal vagy nyers SDK-hiba naplózása.

## Korlát és maradó költségkockázat

Ez nem pénzügyi hard cap. Az elutasított HTTP-/Auth-/App Check-kérések,
Firestore tranzakció-újrapróbálások, Eventarc-események, képletöltések, build,
logok, soft delete, nem aktuális generációk és hálózati forgalom is pénzbe kerülhet.
Az instance/concurrency limit sem helyettesít számlázási korlátot.
App Check token-elfogyasztás nincs bekapcsolva; egy érvényes token a TTL-en belül
újra felhasználható. Az üzleti ismétlést a napló/idempotencia, a hívássűrűséget
a szerveres limiter kezeli. Az elfogyasztás későbbi külön döntés és IAM-kapu.
A kliens Auth+permit alapú Storage-védelme mellett nincs most globális App Check
enforcement változtatás sem Firestore-on, sem Storage-on.

## Csak olvasó felhős előellenőrzés

`pilot-preflight-cli.mjs <helyi-jelentes.json>` a meglévő Firebase CLI munkamenetét
használja a `FIREBASE_TOOLS_AUTH_MODULE` abszolút modulútvonalával.
OAuth csak memóriában marad. GET és kizárólag olvasó getIamPolicy kérés történik.
A script nem aktivál API-t, nem generál service identity-t és nem ír IAM-ot.
403/kommunikációs hiba UNKNOWN; 404 NOT_FOUND. Nyers IAM személyes principal és
remote hibaüzenet nem kerül a jelentésbe.

A jelentés szándékosan nem automatikus GO-engedély: az effektív örökölt/condition/
deny IAM, a telepített kód hash-e és a valós attesztáció nem bizonyítható pusztán
projektbindingokból. Ezekhez külön tulajdonosi és későbbi felhős funkcionális kapu kell.

## Minimális IAM-terv – NEM kiosztott jogosultságok

| Identitás | Szükséges legszűkebb tervezett hozzáférés | Nem szükséges |
|---|---|---|
| attendance-photo-verifier | `storage.objects.get` csak a privát fotóbucketre, lehetőség szerint attendance prefixfeltétellel; `firebaseauth.users.get`; Firestore `datastore.entities.get/create/update`, `datastore.databases.get/getMetadata`; `logging.logEntries.create` | Storage create/update/delete/list, Auth create/update/delete, project Owner/Editor |
| attendance-photo-quota | `firebaseauth.users.get`; ugyanaz a Firestore get/create/update és adatbázis-meta; naplóírás | Minden Storage-jog, fotóreceipt létrehozása a kódon kívül, Auth-írás |
| külön Eventarc trigger SA | `roles/eventarc.eventReceiver` a projekten; `roles/run.invoker` kizárólag a három privát verifier Run-szolgáltatáson | Callable invoker, adatbázis-/Storage-olvasás vagy -írás |
| Cloud Storage service agent | `roles/pubsub.publisher` a projekt szükséges Eventarc útvonalához | Emberi/runtime adminszerep |
| Firebase Storage service agent | Szolgáltatás saját szerepe és cross-service Rules esetén `roles/firebaserules.firestoreServiceAgent` | Emberi szerepkiosztás |
| Eventarc / Cloud Functions / App Check / PubSub / build / Artifact Registry ügynök | Saját szolgáltatásához dokumentált service-agent szerep, valódi projektazonosítóból ellenőrizve | Runtime SA-k összemosása, általános Editor |

A trigger SA nevét nem találgatjuk: a tényleges Function eventTrigger metaadata
vagy külön jóváhagyott kiadási manifest azonosítja. A build/deploy identitás
szintén külön kapu; nem kap tartós runtime jogosultságot. Service-account kulcs
nem készül. A callable végfelhasználói HTTPS transportja lehet publikus,
de Auth+App Check kötelező; a három Eventarc végpont és a bucket nem publikus.
A Firebase Admin SDK megkerüli a Security Rules-t: az IAM Firestore-írás nem
mezőszintű jogosultság, ezért a dedikált identitás és a felülvizsgált backend
kód bizalmi határ. A quota SA kódbeli receipt-írási tiltását az IAM önmagában
nem tudja kollekciószinten kikényszeríteni.

## #61 kiadási lista – minden jóváhagyás továbbra is HIÁNYZIK

1. Név szerinti költséggazda és STOP-felelős; külön írásos Blaze/API/IAM/deploy
   engedély; 5/15/30 USD riasztás. A 30 USD/hó csak javasolt tervezési keret.
2. Europe-west3 projekt/bucket/trigger régió, privát bucket, public access
   prevention, uniform bucket IAM. A lifecycle/soft delete/retention külön döntés.
3. Jóváhagyott App Check Enterprise regisztráció a konkrét web apphoz és
   pontos Hosting domainekhez; jóváhagyott public site key a klienskonfigurációba.
   Nincs cloud debugtoken. Valós böngészős attestáció pozitív/negatív próba később.
4. Elkülönített runtime/trigger/build identitások, effektív IAM tulajdonosi
   ellenőrzése, szükséges API-k csak jóváhagyás után.
5. Tesztelt pontos függőségi PR-lánc és artifact hash. A PWA Firestore/Storage
   Rules telepítése és tartalmi hash-ellenőrzése külön jóváhagyott művelet.
6. Megbízható bootstrap: a meglévő upload policy `revision:1, enabled:false`.
   A híváskorlát policy külön bootstrap, felülvizsgált értékekkel.
   Aktiválás csak `expectedRevision:1, revision:2, enabled:true`.
   A #61 szövegében szereplő disabled→enabled, ugyanazon revision:1 sorrend
   ütközne az optimista verzióellenőrzéssel; ezt a terv javítja, az issue nincs átírva.
7. Legfeljebb 2 szintetikus futár és 1 QA-admin, 7 nap, UID/DA napi3,
   TTL120min, resume24h, extra0, requestAliases4: mind jóváhagyásra vár.
   A QA tesztek nagyobb technikai limitjei nem a pilot értékei.
8. Képek megőrzése 7 nap javaslat; külön döntés az eredeti/noncurrent
   generációkról, soft delete-ről, backupokról, orphanökről, receipt/session/km/
   admin audit és limiter dokumentumokról. Nyers export nem használható.
9. E mennyiségi feltételekkel legfeljebb 42 új munkamenet / 588 kép,
   maximális 8MiB képenként: kb.4,59GiB eredeti képtartalom.
   Ez nem tárhely- vagy költségplafon, nem tartalmazza a fenti járulékos elemeket.
10. STOP-próba: enabled:false megállítja az új engedélykiadást, de a már kiadott
    capability-t nem vonja azonnal vissza. Függő engedély adminRevoke-val,
    sürgős hozzáférés courierAccess.active=false-val zárható; aktív autóhasználat
    lezárásának és hiányzó fotóinak helyreállítási eljárása külön operátori döntés.
    Nincs automatikus kvótavisszatérítés vagy meglévő session migráció.

## Elsődleges dokumentáció

- https://firebase.google.com/docs/app-check/cloud-functions
- https://firebase.google.com/docs/app-check/web/recaptcha-enterprise-provider
- https://firebase.google.com/docs/app-check/web/debug-provider
- https://docs.cloud.google.com/eventarc/docs/roles-permissions
- https://docs.cloud.google.com/iam/docs/roles-permissions/identitytoolkit
- https://docs.cloud.google.com/iam/docs/roles-permissions/firestore
- https://docs.cloud.google.com/iam/docs/roles-permissions/firebaserules
- https://github.com/firebase/firebase-tools/blob/main/src/rulesDeploy.ts
