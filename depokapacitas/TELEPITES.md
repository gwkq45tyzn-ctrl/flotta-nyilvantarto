# DepóKapacitás – GitHub Pages + Google Firebase (Railway nélkül)

## Állapot és biztonság

- A webes felület a nyilvános `flotta-nyilvantarto` GitHub-tároló **külön** `depokapacitas/` mappájában van.
- A flotta eredeti `index.html` fájlja és a meglévő Google Apps Script-szinkronizálása változatlan.
- A Firebase projekt és adatbázis **külön** lesz a flottától.
- A GitHub Pages oldal forráskódja nyilvános, ezért ide **soha** ne tegyél jelszót, privát kulcsot vagy személyes futáradatot.
- A Firebase klienskonfiguráció (apiKey, authDomain, projectId, appId) **nem titkos kulcs**, de önmagában nem nyújt védelmet. Az adatokat a Firebase Authentication és a **kötelező Firestore Security Rules** védi.
- Céges jóváhagyás nélkül ne tölts fel éles jelenléti, GPS-, fotó- vagy csomagadatokat.

## 1. Google Firebase-projekt (egyszeri adminbeállítás)

1. Lépj be a **https://console.firebase.google.com/** oldalra a megfelelő céges Google-fiókkal.
2. Hozz létre egy **új, különálló** projektet (pl. `depokapacitas-belso`). **Ne** a flottához tartozó projektet használd.
3. A *Build → Authentication → Sign-in method* alatt engedélyezd az **Email/Password** módszert.
4. A *Build → Firestore Database* alatt hozz létre adatbázist **Production / Locked** módban, és válassz EU-régiót, ha elérhető és a céges adatkezelési követelmények ezt kívánják. A régió utólag nem mindig módosítható.
5. A Firestore **Rules** fülére másold át a repóban levő **`depokapacitas/firestore.rules` teljes tartalmát**, majd **Publish**. Ne használd a "test mode"/"allow read,write:true" szabályokat.
6. A Firebase Project settings → General → Your apps részen regisztrálj egy **Web** alkalmazást. Másold ki a `firebaseConfig` adatokat.
7. A GitHubon a `depokapacitas/firebase-config.js` fájlban helyettesítsd az üres `apiKey`, `authDomain`, `projectId`, `appId` értékeket a Firebase által megadott **webkonfigurációval**. A titkos Service Account kulcsokat **NE** tedd ide.
8. Az Authentication → Settings → Authorized domains listán legyen engedélyezve a `gwkq45tyzn-ctrl.github.io` domain, ha az adott bejelentkezési mód igényli.

## 2. Első admin és további belső felhasználók

1. Firebase → Authentication → Users → **Add user**: add meg a saját céges e-mail-címedet és egy erős jelszót (a jelszót ne küldd ChatGPT-be).
2. Másold ki a létrehozott felhasználó **UID** azonosítóját.
3. Firebase → Firestore → Start collection: `users`. Dokumentumazonosító: a **pontos UID**. Mezők:
   - `name` (string): pl. `Depóvezető`
   - `role` (string): `admin`
   - `active` (boolean): `true`
4. Az első admin-UID Firestore Console-ból kerül be. Az alkalmazásból **nem lehet saját magunknak adminjogot adni**.
5. További munkatársakat az admin ugyanígy hoz létre az Authentication Users részében, majd az alkalmazás **Felhasználók** oldalán megadja az UID-t és a szerepkört: `admin`, `editor`, `viewer`.
6. Az alkalmazás **nem tartalmaz nyitott regisztrációs felületet**. Bárki létrehozott Firebase Auth-fiókja sem fér hozzá a depóadatokhoz, amíg nincs külön **aktív `users/{uid}` jogosultsági dokumentuma**.
7. A Firestore szabályok az adathozzáférést szerveroldalon ellenőrzik; önmagában az oldal elrejtése nem biztonsági védelem.

## 3. Megnyitás és ellenőrzés

Tervezett cím (csak akkor működik, ha a GitHub Pages a tárolóban már aktív):
`https://gwkq45tyzn-ctrl.github.io/flotta-nyilvantarto/depokapacitas/`

A beállítás előtt az alkalmazás **nem** próbál éles depóadatokat megjeleníteni, hanem figyelmeztet a hiányzó konfigurációra.

Elvárt tesztek:
- Bejelentkezés nélkül semmilyen depóadat nem tölthető le a Firestore-ból.
- Firebase Auth-fiókkal, **de** `users/{uid}` engedély nélkül a rendszer tilt.
- `viewer` csak olvas; `editor` tervez és szerkeszt; `admin` kezelheti a hozzáféréseket.
- Ugyanarra a napra ugyanaz az autó vagy futár kétszer **nem** foglalható; a közös tranzakció és a Firestore-szabályok együtt biztosítják.
- A flotta saját oldala és adatai változatlanok.
- Mobilon Safari/Chrome belépés, lista és beosztás.

## 4. Google Attendance – automatikus szinkron céges jóváhagyás után

Adatforrás: az eredeti iMile Driver Attendance – Log In Out **Google-táblázat** `Mobile Attendance` munkalapja. A szkript **csak olvassa** az eredeti táblát, a DepóKapacitás adatbázisába ír.

1. Nyisd meg a **https://script.google.com/** oldalt céges, az eredeti Google-táblához hozzáférő felhasználóval. Készíts egy új, **önálló Apps Script** projektet.
2. A `depokapacitas/google-sync/Code.gs` tartalmát illeszd a Code.gs fájlba.
3. A `DEPO_PROJECT_ID='ADD_FIREBASE_PROJECT_ID'` értéket írd át **az új** Firebase-projekt azonosítójára.
4. A Project settings alatt engedélyezd az `appsscript.json` manifeszt szerkesztését és másold be a `depokapacitas/google-sync/appsscript.json` tartalmát.
5. A Google Cloud Console-ban a szkriptet futtató **Google-felhasználónak** add meg a projekt Firestore írásához szükséges **IAM-jogosultságot** (a legszűkebb cégesen jóváhagyott szerepkörrel). Az Apps Script OAuth-hozzáférési tokenje nem ugyanaz, mint a Firebase web API kulcsa. Egyes szervezeteknél a szkriptet szabványos, ugyanahhoz a GCP-projekthez csatolt Apps Script projektként kell beállítani a szükséges OAuth-hatókörökhöz.
6. A Script Editorban kézzel futtasd egyszer a `syncAttendance()` függvényt; a Google-kérésekhez szükséges jogosultságokat hagyd jóvá. Ellenőrizd, hogy a Firestore `attendance` gyűjtemény megkapta az eseményeket.
7. Ezután kézzel futtasd az `installFiveMinuteTrigger()` függvényt. Ötpercenként automatikus, új sorokra irányuló szinkron fog futni.
8. A fotók csak eredeti, jogosultságvédett Google Drive hivatkozásként szerepelnek; a kép megnyitásához a felhasználónak **Google Drive-jogosultsága is kell**. **Nem** változtatjuk őket nyilvánossá.
9. Ha az eredeti táblázat régebbi sorait átírták, a `resetAttendanceImport()` kézi futtatásával újra beolvasható az összes sor (azonos események frissülnek).

**Fontos:** az automatikus szinkron **nem működik addig**, amíg az Apps Script projekt, OAuth és IAM-jogosultság nincs külön beállítva és sikeresen ellenőrizve. A GitHub Pages erre önmagában nem képes.

## 5. Importálás, exportálás

Bejelentkezett belső szerkesztők CSV/XLS/XLSX fájlokat tölthetnek fel:
- Kerületi csomagigény: `Date`, `District`, `New`, `Retry`.
- Futáreredmény: `Date`, `DA Code`, `District`, `Picked`, `Success`, `Failed`.
- Attendance: az eredeti `Mobile Attendance` lap fejléceivel.
- Egyéb operatív adatok: saját `sourceRows` adattár.

A feltöltés a böngészőben dolgozza fel a fájlt, majd a Firestore-ba ment. A CSV-export csak a bejelentkezés után aktív. A felület valós idejű Firestore-figyelőket használ (`onSnapshot`).

## 6. Adatvédelem, üzemeltetés

- A Firebase/Google külső felhőszolgáltató. Céges adatkezelési engedély, hozzáférés-felülvizsgálat, mentési és megőrzési szabályzat szükséges.
- Az `apiKey` webes publikus konfiguráció, nem adatbázis-admin-kulcs. **A Firestore Security Rules bekapcsolása nélkül SOHA ne használjátok éles adatokkal.**
- Az eredeti Attendance-táblát az alkalmazás nem írja felül.
- Éles indulás előtt ellenőrizni kell a Firestore költségkeretet, mentéseket, EU-adattárolási szabályokat és szerepköröket.
- Ha később valódi, csak VPN-ről elérhető weboldalt szeretnétek, a GitHub Pages nyilvános frontend helyett védett hosting szükséges.

## Üzemeltetői fájlok
- `index.html`: mobilbarát webes felület
- `app.js`: Firebase Auth + valós idejű Firestore, foglalás, KPI-k, import/export
- `style.css`: reszponzív megjelenés
- `firebase-config.js`: publikus webkonfiguráció (egyelőre üres)
- `firestore.rules`: **szükséges** szerveroldali jogosultságok
- `google-sync/`: opcionális élő Attendance összekötő
