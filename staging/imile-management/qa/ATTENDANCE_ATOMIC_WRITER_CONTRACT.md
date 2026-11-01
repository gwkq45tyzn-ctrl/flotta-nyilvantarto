# #28 ➜ atomi Attendance-publikáló: elkülönített, NEM élesíthető szerződés

**Státusz:** QA-terv és tiszta, csak memóriában működő prototípus.
**Kiindulás:** PR #28, commit `30707b2857c7c239b0feda751f11672046fce66f`.
**Biztonság:** NINCS Google Sheets / Apps Script / Firebase írás, IAM változtatás vagy Hosting deploy.
A `depokapacitas/attendance-atomic-plan.mjs` semmilyen élő adatforrásra nem kapcsolódik, `confirmedAt` mezőt szándékosan **nem** ad ki és `authorizedForBooking:false` marad. A kimenete **nem** tölthető be hiteles bizonylatként.

## A jelenlegi integráció tényleges hiánya

A meglévő `depokapacitas/google-sync/Code.gs` 5 perces triggerrel, 200-as csoportokban író REST commitokkal és monoton sorvízjellel (`DEPO_ATTENDANCE_NEXT_ROW`) dolgozik. Egy új sor eseményt és a teljes napi `attendanceVehicleGuards` projectiont **nem** ír egyszerre; az utólag szerkesztett/törölt sorok a vízjel miatt nem kerülnek automatikusan újra feldolgozásra. A jelenlegi szkriptnek még `ADD_FIREBASE_PROJECT_ID` helyőrzője is van: ez a repóban nem igazolja, hogy bármelyik régi Apps Script ténylegesen fut.

A #28 Firestore-szabálya csak akkor enged mai foglalást, ha a hitelesített guard `confirmedAt` értéke legfeljebb 120 másodperces. Az ötpercenként futó trigger **önmagában akkor sem elegendő**, ha a hiányzó bizonylatot később elkezdené írni.

## A jóváhagyandó írási szerződés

1. **Egyetlen írási pont.** Az adatgazda előbb feltérképezi az összes jogosult IAM-írási útvonalat, a Google szinkront és a kézi javításokat. Külön IAM jogosultságkezeléssel / működésképtelenné tett régi írókkal szavatolja, hogy semmi nem kerülhet az `attendance` gyűjteménybe az új publikálót megkerülve. Firestore Security Rules az IAM szerveres hozzáférést **nem** korlátozza.
2. **Teljes, tranzakciós történet.** A publikáló minden érintett járműre látja a teljes, bizonyított forrástörténetet, beleértve az előző napról áthúzódó kiadásokat, a későn beérkező Log In/Out eseményeket és a javításokat. Szöveges járműfeliratból nem következtet rendszámra vagy DA-ra.
3. **Atomi változás.** Egy azonosított esemény beszúrása/javítása/törlése és a kapcsolódó `attendanceVehicleGuards/{YYYY-MM-DD__PLATE}` állapotának újraszámítása **ugyanabban a Firestore tranzakcióban** történik. A forrásgeneráció ellenőrzött revízióját is ugyanott zárja. Ha a javítás megváltoztatja a rendszámot, mindkét érintett autót újraszámolja, különben az eseményt visszautasítja.
4. **Determinista és fail-closed logika.** Azonos esemény ugyanazzal az ID-val ismételten nem hoz létre új kiadást. Azonos ID-val eltérő esemény, bizonytalan időpont, ellentmondó foglalás/kiadás, ismeretlen/inaktív futár, nem elérhető autó és hiányos visszaadási fotók esetén a guard **blocked** vagy nem kerül kiírásra. Csak igazolt teljes történet és ellenőrzött aktuális állapot engedhet **clear** vagy **assigned** értéket.
5. **Forrásesemény és frissített bizonylat egy commit.** A szerver írja a `confirmedAt` Firestore Timestampet az atomi tranzakcióban. A 120 másodperces időkorlátot csak jogosult, a teljes forrásgenerációt ugyanabban a tranzakcióban igazoló frissítő tarthatja életben. Egyszerű időzített külön guard-írás nem megengedett.
6. **Visszaállítás és audit.** Idempotens forrásazonosító, revízió, szerveroldali audit, visszajátszható privát backup, teljes történeti backfill és valós üzemi rollback-próba szükséges, mielőtt a #28 beolvadhat. A Google-sorok közvetlenül nem bizonyítanak teljes konzisztenciát.

## Mit készített elő ez a QA-ág?

- `attendance-atomic-plan.mjs`: szintetikus eseményfolyamból csak **javasolt** guardállapotot és esemény/guard együttes írási szándékot képez. Nem képes IAM-azonosságot igazolni, ezért nincs benne hálózati vagy Firestore írás.
- `attendance-atomic-plan.test.mjs`: teljes/nem teljes forrás bizonyítása, duplikált esemény, ütközés, hiányos fotó, tegnapról átnyúló kiadás és visszaadás, más járműre történő javítás, hibás adat és módosítási revízió.
- A teljes staging CI futtatja a szintetikus teszteket a meglévő #28 regressziók mellett.

## Fennmaradó explicit Work / adatgazdai döntések

- Pontosan **melyik Apps Script / Google Sheet / szerverfolyamat** az Attendance hiteles forrása? Mely IAM-fiókok írhatják a Firestore `attendance` rekordokat, és hogyan tiltjuk/fence-eljük az alternatív írókat? Ezt nem lehet kizárólag a repó tartalmából bizonyítani.
- Engedélyezett-e a mai foglalás, ha a járművet az Attendance-ben azonos DA már kiadta? A #28 ezt jelenleg megengedi.
- Mi történjen az ismeretlen jármű nélküli régi Attendance-eseményekkel, a hiányos visszaadás-fotókkal, a késői javításokkal és az éjszakán átnyúló kiadásokkal?
- Jóváhagyható-e egy minimum jogosultságú központi publikáló (pl. Cloud Run / Cloud Functions), és ki fizeti/üzemelteti? Ha nem, lehet alternatív, de azonos atomi garanciát nyújtó meglévő IAM-folyamatot tervezni.
- A teljes **tartós staging adminbelépés**, adatátállás és restore kapuk továbbra sem igazoltak.

**Kiadási döntés:** PR #28 és ez a QA-ág továbbra is **DRAFT, merge/deploy tilos** a hiteles központi publikáló nélkül. Soha ne készíts a felhőben szintetikus `clear` bizonylatot csak azért, hogy a napi foglalás működőképesnek tűnjön.
