# Végső helyi/szintetikus kiadási előkészítés – #61

Kiindulás PR #62, fbf5a04a0537f3525d72f9a7029f7a3e2bc1ee8a.
Minden alábbi felhős művelet **TILOS külön jóváhagyás nélkül**.
Ez a dokumentum nem telepítő és nem engedély.

## Tényleges javítás és célzott bizonyíték

A STOP reprodukálható hibája: revision3 enabled:false után az adminRevoke is
UPLOADS_DISABLED hibával leállt. A quota-service csak e jogosultságszűkítő
adminművelethez olvashat kikapcsolt, továbbra is teljesen validált policy-t.
Grant, resume, begin és checkout-engedély megújítása kikapcsolt policy-nél tiltott.
Az admin szerepkör, audit és a SESSION_ALREADY_CREATED/lock ellenőrzés megmarad.

25 valódi helyi Auth/Functions/Firestore/Storage próba igazolta a rev1 zárt
bootstrap → rev2 aktiválás → rev3 STOP → rev4 zárt helyreállítás → rev5 explicit
újraaktiválás sorrendet. A végső állapotban 7+7 eredeti JPEG, ugyanaz a session,
azonos eredeti objektumgenerációk, UID/DA used=1, reviewed session, Fleet km=125.
STOP alatt az aktív session és mindhárom zár byte-szintű JSON-pillanatképe megmaradt.

## Commit- és komponensbizonyíték

A release-pr-chain.json a GitHubról ellenőrzött 30 egymásra épülő PR fejét és
8 kapcsolódó oldalsó PR-t rögzíti. Nem minden nyitott PR automatikus függőség.
A manifest minden fejhez ANCESTOR vagy külön felülvizsgálandó integrált/származtatott
viszonyt ad; hiányzó Git-objektum hibát okoz, nem lesz hamisan „oldalág”.

29 stack-head valódi Git-ős. A #34 utolsó resource==null Storage-javítása oldalsó
commit, de a jelenlegi Storage Rules kifejezetten tartalmazza; az immutable
overwrite-tiltást a 27 Storage/Firestore és a verifier/kvóta emulátoros csomag teszteli.
A korábbi #34 emulátorfájlnevek helyett a mostani, szigorúbb QA-konfigurációk
használandók; az elavult head nem telepítendő külön.

| Oldalsó/korábbi funkció | Jelenlegi bizonyíték, későbbi megőrzés |
|---|---|
| #48 DA-záras Depó-kapacitás | #50 60fd5ad/36a7a14 és #52 aktív törzsellenőrzés; roster.test.mjs, Depó physical booking/occupancy és capacity tesztek |
| #49 napi km/CSV | #50 ff15f4b/cd1feaf/34a6b0a, majd #53 sérülési/állapotriport és #57 részletes CSV; daily-report.test.mjs és build allowlist |
| #20 szerviz/eseménytörténet | fleet/operations.test.mjs, service-history-safety.integration.test.mjs, compiled fleet rules |
| #21 mai foglalás/kiadás | fleet/availability.test.mjs, core-readiness.integration.test.mjs, physical-booking-rules-emulator.mjs |
| #22 élő forráskapu | fleet/live-source-guard.integration.test.mjs, source-health.test.mjs |
| #23 közös Flotta felület | fleet/operations és master-data csomag, entry.test.mjs, compiled Fleet Rules |
| #24 átállási előellenőrzés | core-cutover-preflight.test.mjs, cutover-browser.integration.test.mjs |
| #27 igény/fizikai foglalás-védelem | #28 és későbbi kétirányú Rules; booking-physical-guard, occupancy, physical-booking-rules-emulator |

Ezek későbbi, tesztelt megvalósítások; nem állítunk azonos fájltartalmat az
összes régi oldalsó PR-rel. Nem olvasztjuk vissza azok elavult kódját.
A végső diff a #62-höz képest egyetlen runtime-viselkedésváltozás (STOP revoke),
QA/manifest/dokumentáció/CI. Nincs adatmodell-migráció, Rules-, PWA-, Depó- vagy
riportkód-változás. Ez a forrás- és szintetikus regressziós bizonyíték nem
bizonyítja a valós üzleti adatok teljességét; valós adatot most nem olvastunk/importáltunk.

A release-manifest.mjs kizárólag Git-objektumokat és helyi fájlokat olvas.
--fetch-dependencies csak pontos Git-SHA-kat tölt le, felhős Firebase-et nem érint.
Az előállított manifest sourceCommit/gitTree/Git-blob/SHA256 értékeket tartalmaz:
Firestore Rules, Storage Rules, a tíz Functions runtime/függőségi fájl, PWA,
DepóKapacitás, közös Flotta/riportok és build/CI. A webcsomag 64 forrás +2 generált
fájl; tiltott extra, tartalomeltérés, symlink vagy más Hosting-bootstrap hibát okoz.
Az artifact manifest külön CI-artifact, nem kerül Hosting public könyvtárba.

Előállítás tiszta, pontos checkoutban, a meglévő build után:

    node staging/imile-management/photo-verifier/release-manifest.mjs release-manifest.json
    node staging/imile-management/photo-verifier/release-manifest.mjs --verify release-manifest.json

A manifest nem tartalmaz saját commitot visszaható módon: mindig az elkészült
Git-commitból keletkező külső kiadási artifact. A végső SHA és CI a Draft PR-ben,
a manifestben és a #61 eredménykiegészítésében azonosítandó.

## Bevezetés – három külön kapu

**Most elkészült / nem felhős:** pontos source/manifest/CI; STOP és recovery QA;
szintetikus retention dry-run; dokumentált IAM/költség/rollback döntési lista.

**Jóváhagyandó előfeltétel:** költséggazda és ügyeletes, reakcióidő és STOP-jog;
Blaze/számlázás, API-k, privát bucket és megőrzés/soft delete, dedikált IAM,
App Check Enterprise regisztráció/domains/site key, telepítési ablak/pilotfiókok.
Minden approval továbbra is HIÁNYZIK. Az APPCHECK_PILOT.hu.md és a redaktált
cloud-preflight-20261102.json előző read-only bizonyíték, nem aktuális GO-engedély.

**Csak későbbi jóváhagyott cloud ablakban:**
1. Read-only állapot- és konfigurációmentés: Rules releases/tartalmak, Functions
   source/build/revision/SA/trigger/filter, Hosting channel/version, bucket/IAM/
   retention/soft delete, API/billing, policy revision/hash. Titkok és nyers adatok
   privát mentésben; nem GitHubon. STOP és pontos operátori rollback terv kéznél.
2. Jóváhagyott billing + projekt-szűrt monitoring/budget előbb; csak utána fizetős
   infrastruktúra. Europe-west3, pontos projekt/bucket, külön runtime/trigger/
   build identitások; privát bucket és cross-service Rules IAM előellenőrzés.
3. App Check regisztráció és jóváhagyott public site key. Firestore/Storage Rules
   zárt alapállapotban, nincs aktív pilot courierAccess. A CLI ne javítson vagy
   adjon automatikusan IAM-jogot. Előre igazolt cross-service szerep kell.
4. Pontos manifest szerinti Functions: három privát verifier + külön
   Auth/App Check callable. Runtime és trigger SA tényleges ellenőrzése;
   allUsers/allAuthenticatedUsers tilos a bucketen és a verifier invokeren.
5. A teljes kvótapolicy első dokumentuma revision1 enabled:false, auditált
   expectedRevision0 bootstrap. Külön szerveres híváskorlát-policy bootstrap.
   A hiányzó policy egyébként is zárt, nem helyettesíthető kliens-defaulttal.
6. Két jóváhagyott szintetikus futár és egy QA-admin; nem valós hozzáférések.
   A zárt Hosting preview pontos verzióját telepítsük és vizsgáljuk ELŐBB.
   Hiányzó/hibás App Check és disabled-policy negatív próba, privát bucket és
   valódi IAM negatív próba kell, miközben a pilot még nincs aktiválva.
7. Csak külön aktiválási döntés után expectedRevision1 → revision2 enabled:true.
   Napi3 UID/DA, TTL120min, resume24h, extra0, alias4, max7nap: még csak javaslat.
   A teljes 7+7, revokáció, STOP/recovery és fizikai visszavétel cloud próbája.

## STOP, helyreállítás és rollback

- Új revízió enabled:false: begin ÉS checkout-engedély kiadása/megújítása tiltott.
  Már kiadott capability ettől még érvényes lehet; ez nem teljes Storage STOP.
- Függő, session nélküli engedély adminRevoke-val most STOP után is visszavonható,
  indoklással és operationId szerinti idempotens audittal, kvótavisszatérítés nélkül.
- Azonnali futár-hozzáféréslezárás courierAccess.active=false, szükség szerint
  Auth disabled/refresh-token revocation IS. Az Auth tiltás önmagában nem
  garantálja a már kibocsátott token azonnali megszűnését minden Rules szolgáltatásban.
  Saját hozzáférési státusz/ledger metaadata továbbra is olvasható lehet;
  a session/fotó üzleti hozzáférés és írás kerül lezárásra.
- Aktív session adminRevoke-ja SESSION_ALREADY_CREATED: a három zár és a
  járműhasználati bizonyíték változatlan marad. Ne töröljük a sessiont, lockot,
  receiptet, számlálót vagy eredeti fotót „visszaállítás” címen.
- Először privát read-only bizonyíték és új zárt revízió, majd kompatibilis,
  manifesttel azonosított kód/Rules/Hosting rollback. Nem állítunk vissza régebbi
  vagy engedőbb Rules-t, ha az aktív új protokollt/sémát nem ismeri.
  Nincs Firestore/GCS snapshot-visszatöltés az új események fölé.
- Az adminPolicy régi snapshotja nem írható vissza azonos/régebbi revízióval.
  A tesztelt példa STOP3 → restore4 false → jóváhagyott enable5 true.
- Függő, megszakadt feltöltés adminResume után ugyanazon ID-val és eredeti
  képekkel folytatható; a visszaadási cap megújítása az aktív sessiont használja.
  Aktív sessionre adminResume nem használható, és nem szabad a zárakat feloldani.
- Ha már mind a hét eredeti tárgy létrejött, de a finalize feldolgozás STOP alatt
  tiltásba futott, a puszta access-visszaadás nem hoz új Storage eseményt.
  A helyi teszt az eredeti Storage→Functions CloudEvent útvonalon, változatlan
  objektumok mellett, a meglévő hitelesítővel dolgozta fel újra az eseményt.
  Nem készült új public replay endpoint, admin által gyártott receipt vagy
  párhuzamos hitelesítő. Cloudban ehhez előre jóváhagyott, privát operátori
  replay útvonal/identitás és audit kell; annak IAM-ja még NEM tesztelt.
- Visszaállított receipt sem szabadít autót: 7+7 checkout → awaiting_review,
  csak fizikai autó/kulcs/tisztaság review után atomi Fleet km + lockfelszabadítás.

## IAM és költségfigyelés – alkalmazás nélkül

Az APPCHECK_PILOT.hu.md pontos minimum-permission táblája érvényes. Külön
attendance-photo-verifier: storage.objects.get csak fotóbucket/prefix,
firebaseauth.users.get, Firestore get/create/update és adatbázis-meta, naplóírás.
Quota SA: ugyanez Storage-jog nélkül. Nincs Auth-write, delete, Owner/Editor vagy
letölthető SA-kulcs. Firestore Admin SDK-jogokat a Rules nem szűkíti kollekcióra.
Eventarc trigger SA: eventReceiver és csak a három verifier Run-invoker.
Build/deploy, operátori recovery és runtime identitás külön felülvizsgálandó.
App Check normál JWT-ellenőrzéshez nincs token-elfogyasztási szerepkör bevezetve.
Service agents csak saját dokumentált szerepet kapnak: GCS PubSub publisher
(azonosított transzporttopicra szűkítés vizsgálandó), Firebase Storage cross-service
Firestore read, Functions/Eventarc/AppCheck/build/Artifact Registry saját agent.
Örökölt/condition/deny és resource IAM hiányában nincs automatikus GO.

Jóváhagyásra váró terv: project-szűrt 30USD/hó, 5/15/30USD actual és forecast
értesítés; számlázás/SKU/régiós díjak előzetes tulajdonosi ellenőrzése.
Késleltetett budget és általános maxInstances NEM hard cap. Négy külön Function
van, mindegyik maxInstances2: nem globális kettő! A három verifier 1GiB/1CPU,
a callable 256MiB/1CPU; fizetős build/log/egress/Firestore/AppCheck is lehetséges.
Két futár × napi3 ×7nap ×14×8MiB = kb4,59GiB eredeti képtartalom, nem teljes
tárhely- vagy költségplafon. Generációk, soft delete és backup tovább növelhetik.

Pilot start előtt tesztértesítés a név szerinti operátornak, elérési út és
jóváhagyott reakcióidő szükséges. Figyelendő: számlázási késés, Cloud Run
401/403/429/5xx és invocation növekedés, verifier pending/rejected/retry,
Eventarc backlog/legöregebb esemény, receipt-hiány, upload/daily/call-limit
kimerülés, objektumszám/bytes/generációk/soft delete, Firestore reads/writes/
transaction retry, log volume, audit műveletek és aktív autók/zárak.
Alacsony számosságú aggregátumok; nincs UID/path/JWT/fotó-adat a riasztási logban.
Küszöbök és automatikus STOP jogosultsága külön döntés; nincs budget-trigger által
automatikusan kikapcsolt billing vagy adatot törlő költségcsökkentés.

## Adatmegőrzés – csak tervezés és szintetikus dry-run

Nem aktiválunk lifecycle-t, TTL-t, logretentiont vagy törlést.
7 nap csak szintetikus fotókhoz javaslat; nem lehet vak age>=7 bucket-szabály,
mert törölhetné egy aktív/ellenőrizetlen használat eredeti bizonyítékait.

| Adatkör | Biztonságos előfeltétel / függő döntés |
|---|---|
| Fotó és eredeti generáció | reviewed session, nulla lock, lejárt in/out/resume/lease, nincs jogi/biztosítási hold, teljes hiteles inventory; idő a review és resume-horizont után számítandó |
| Noncurrent/lecserélt eredeti | hash/generation konfliktus vizsgálati HOLD; új generáció nem helyettesíti a receipt eredetijét; orphan sem törölhető pusztán prefix alapján |
| Megszakadt feltöltés | élő/megújítható grant alatt megőrzés; lejárt, session nélküli, ismert permithez tartozó tárgy legfeljebb emberi review-jelölt |
| Resumable upload token/cache | nem kerül perzisztens üzleti mentésbe; platformsession expiry és lokális memóriában tartott képek külön kezelendők |
| photoReceipts és session/km | képpel együtt visszakereshető bizonyítéklánc, hold/revokáció megőrzése; törlés után verifier invalidáció és riportkövetkezmény külön tesztelendő jóváhagyás után |
| Napi UID/DA számlálók | aktuális üzleti nap alatt soha ne TTL-ezzük/reseteljük; elmúlt napok megőrzési ideje adatgazdai döntés |
| Request journal/lease/permit | régi kliens retry miatt az egyszerű TTL idempotenciavesztést és új kvótafogyasztást okozhat; tombstone/lezárási protokoll nélkül nincs automatikus purge |
| Admin audit és híváslimiter | audit megőrzés külön döntés; limiter törlése új burstöt adhat, nincs runtime automatikus TTL |
| Cloud logok | bucket-specifikus retention és kötelező audit megőrzés külön; nem feltételezünk minden logra egységes 7/30 napot |
| Soft delete/backup | külön lejárat és költség, helyreállítás új generációt adhat; az eredeti hash egyezése önmagában nem éleszthet fel revoked receiptet |

A retention-review.mjs kizárólag HOLD vagy REVIEW_CANDIDATE_ONLY eredményt ad;
deleteAuthorized mindig false. Nincs SDK/API/törlési funkció. Nyolc szintetikus
teszt védi az aktív sessiont, lockot, holdot, resume-horizontot, ismeretlen
előzményt és eltérő generációt. Ez nem bizonyítja a felhős lifecycle/soft delete
vagy backup restore működését; az továbbra is későbbi jóváhagyott próba.

Elsődleges források:
https://docs.cloud.google.com/billing/docs/how-to/budgets
https://docs.cloud.google.com/storage/docs/lifecycle
https://docs.cloud.google.com/storage/docs/soft-delete
https://docs.cloud.google.com/logging/quotas
https://docs.cloud.google.com/eventarc/docs/roles-permissions
https://firebase.google.com/docs/app-check/cloud-functions

## Kiadási állapot

Helyi/szintetikus bizonyíték és kiadási artifact előkészíthető.
Felhős pilot: **NO-GO / UNAPPROVED**. Következő tényleges lépés a #61 összevont
tulajdonosi jóváhagyása és a privát recovery-operátor szerepének kijelölése;
utána új read-only preflight, majd csak jóváhagyott zárt staging telepítés.
