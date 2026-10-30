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
