iMile Management – staging tesztoldal frissítése Work nélkül

Csak a staging ágra és az imile-management-staging Firebase-projektre vonatkozik.
Az éles Flotta Nyilvántartó és a Hosting live csatorna változatlan.

AUTOMATIKUS GITHUB ACTIONS
A staging ág push eseményeire a .github/workflows/imile-staging.yml
lefuttatja a Node.js teszteket, majd elkészíti az imile-staging-preview
letölthető artifactot. Ha megvan a
FIREBASE_SERVICE_ACCOUNT_IMILE_MANAGEMENT_STAGING GitHub Actions secret,
a csomagot a Firebase imile-qa előnézeti csatornájára telepíti 7 napra.
A tesztoldal URL-jét a futás összefoglalójába írja.
Secret nélkül nincs automatikus telepítés, de a tesztcsomag elkészül.
Ne küldj jelszót vagy privát kulcsot a GitHub-kódba vagy chatbe.

GitHub Actions:
https://github.com/gwkq45tyzn-ctrl/flotta-nyilvantarto/actions
(A staging-workflow az új ágon található; először az Actions futások között keresd.)

EGYSZERI HELYI TELEPÍTÉS (WINDOWS POWERSHELL / MAC TERMINAL)
A saját gépen Git, Node.js 22+ és internet szükséges.
Futtasd sorrendben:

git clone --branch staging/imile-management-integration --single-branch https://github.com/gwkq45tyzn-ctrl/flotta-nyilvantarto.git imile-staging
cd imile-staging
node staging/imile-management/deploy-preview.mjs

A script először tesztel, aztán generálja a minimalizált webcsomagot.
A Firebase saját hivatalos Google-bejelentkezését kéri a böngészőben.
Ezután kizárólag a Firebase imile-qa preview csatornájára telepít.
A pontos tesztoldal URL-jét maga a Firebase CLI írja ki a végén.
A már létező preview-imile-staging könyvtárat nem írja felül.

ELLENŐRZÉS A FRISS PREVIEW OLDALON
1. Belépés a már működő imilemanagement staging felhasználóval.
2. A közös főmenüből válaszd a Staging tesztadatok előkészítése lehetőséget.
3. Ellenőrizd a SYNTHETIC_TEST futárt és TESTCAR01 autót. Ha hiányoznak,
   az admin-oldal csak megerősítés után hozza létre a hiányzó mintarekordokat.
4. Kattints a Teljes staging foglalási teszt indítása gombra.
   A QA teszt mesterséges 2099-01-15 napra hoz létre 100 csomagos foglalást
   és futárzárolást, ellenőrzi az újbóli felülírás tiltását, majd megpróbálja
   az ideiglenes foglalást, zárolást és újonnan létrehozott kapacitást visszavonni.
5. Ha hibát ír, másold ki a QA naplót. Különösen figyelj a
   VISSZAMARADT REKORD LEHETSÉGES üzenetre; ellenőrzés nélkül ne ismételd.
6. Ellenőrizd, hogy a főmenüből mindkét modul megnyílik újabb belépés nélkül.

A drivers/SYNTHETIC_TEST és vehicles/TESTCAR01 törzsrekordok megmaradhatnak,
mert a Firestore Security Rules a kliensoldali törlésüket tiltja.
Törlésükhöz külön, jogosult Firebase Console/IAM művelet szükséges.

KORLÁT
A Work korábban 8/8 böngészős közös belépési tesztet sikeresen végzett.
A foglalás teljes élő tesztje csak a QA futás sikeres végrehajtása után
igazolható; az új Flotta teljes régi funkcióinak migrációja még nem kész.


2026-10-30 – KÖZÖS FLOTTA TÖRZS SZERKESZTÉSE

A legfrissebb staging verzió a főmenü Flotta törzsadatok (staging)
moduljában tartalmazza a futár- és járműtörzs adminisztrátori kezelését.

- Aktív admin Firestore-fiókkal lehet új futárt vagy járművet létrehozni,
  vagy meglévő staging rekordot a táblázat Szerkesztés gombjával módosítani.
- Viewer/editor a Flotta törzset továbbra is csak olvasni tudja.
- A DA-kód és a rendszám azonosítója létrehozás után nem változtatható.
- Minden mentésnél megerősítést kér, és tranzakcióban ellenőrzi,
  hogy nem történt-e közben konkurens módosítás.
- Futár inaktiválása és autó Szerviz/Leállított állapota a
  DepóKapacitás tervezhető kapacitásából kizárja az érintett rekordot.
- Ez továbbra sem a régi Fleet Manager összes funkciójának migrációja:
  autókiadás, visszavétel, telefonok, szerviznapló, biztosítások,
  tankolókártyák és az éles Google-szinkron még külön átállítandó.

Ellenőrzési sorrend: staging admin login -> Flotta törzsadatok ->
mesterséges futár és jármű -> DepóKapacitás lista és beosztás ->
staging Flotta: autó Szerviz -> DepóKapacitás: 0 tervezhető kapacitás
az adott autóra -> autó Elérhető, futár Inaktív -> megfelelő kizárás.

Ne módosíts valós depóadatot a staging rendszer ellenőrzésére.
Csak elkülönített mesterséges rekordokat és tesztnapot használj.

OFFLINE ELLENŐRZÉSEK
node staging/imile-management/fleet/master-data.test.mjs
node staging/imile-management/fleet/master-editor.test.mjs
node staging/imile-management/fleet/shared-capacity.integration.test.mjs

FONTOS: Az új Flotta admin-funkciók GitHubra kerülése nem bizonyítja,
hogy a legfrissebb Firebase Hosting preview csatornára is kikerültek.
A böngészős teszt eredményét csak valós staging URL és bejelentkezés után
tekintjük igazoltnak.


2026-10-30 18:56 UTÁNI ÁLLAPOT – TÉNYLEGES GITHUB ACTIONS FUTÁS

GitHub Actions run: https://github.com/gwkq45tyzn-ctrl/flotta-nyilvantarto/actions/runs/41101609802
Eredmény: completed / success.
A sikeres futás tartalmazta az összes staging Flotta és DepóKapacitás offline
tesztet, Firestore szabályok kódszintű ellenőrzését, staging buildet,
valamint az éles Fleet main/index.html változatlanságának ellenőrzését.

Letölthető ellenőrzött webcsomag:
https://github.com/gwkq45tyzn-ctrl/flotta-nyilvantarto/actions/runs/41101609802/artifacts/12998197364
Artifact neve: imile-staging-preview, ID: 12998197364, ~45 627 byte.

A Firebase Hosting telepítés EBBEN a PR-es futásban NEM történt meg:
1. A workflow PR eseményből indul, a telepítési lépés pedig csak push
   esemény esetén futna.
2. A napló szerint a FIREBASE_SERVICE_ACCOUNT_IMILE_MANAGEMENT_STAGING
   GitHub secret üres/hiányzik. A Hosting jog nem került átadásra.
3. Nem áll rendelkezésre a friss, tényleges Firebase preview URL;
   nincs sikeres böngészős CRUD/foglalás E2E visszaigazolás.

A Firebase adminnak a fenti dokumentum korábbi A vagy B útvonala
szerint kell biztonságosan telepítenie a csomagot. Ne oszd meg a
service-account kulcsot vagy felhasználói jelszót ebben a beszélgetésben.

A teljes régi Flotta Nyilvántartó további moduljai (kiadás,
visszavétel, telefonok, szerviz, biztosítások) NEM kerültek át,
az új staging Flotta jelenleg csak közös törzsadatokat kezel.
