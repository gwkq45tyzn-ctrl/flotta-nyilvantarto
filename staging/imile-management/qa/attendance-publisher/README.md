# #30 – hiteles Attendance-publikáló: üzemi leltár és izolált adapter

**2026-11-01, QA/DRAFT. Nincs telepítés, import, IAM- vagy üzemi adatváltoztatás.**
Alap: #29 `3c890a9c8fa838c81671eac3fe791a47f32bf8c6`, a #28/#29 meglévő
foglalási és forrástörténeti logikája változatlan. Nem új foglalási rendszer.

## Tényleges, jogosult, csak olvasó ellenőrzés

| Vizsgálat | Eredmény | Korlát |
|---|---|---|
| Firestore | **Bizonyított:** `(default)`, Standard / Native, `europe-west3` | Csak az `imile-management-staging` projekt |
| Attendance és guard | **Bizonyított:** mindkét gyűjteményben 0 dokumentum a méréskor | Nem bizonyít másik projektben futó szinkront |
| Publikált Rules | **Bizonyított:** a release frissítése 2026-11-01 18:06:59 UTC; nincs guard-match vagy `trusted-attendance-projection-v1`; editor létrehozás/módosítás, admin törlés létezik az Attendance-en | A #28 nincs publikálva; nem változtattuk meg |
| Publikált Rules SHA256 | `9cdb22ab1b5de03f5a04348464302c2d26a60dc4e51af6e19c866cdc9e12dd98` | A fájltartalmak sorrendben összefűzve, változatlan bájtokkal |
| Projekt IAM + szülők | **Bizonyított:** projekt-ancestry, nincs szervezeti/mappa szülő; 7 role-binding, 5 külön principal | Pillanatnyi jogosultság, nem futási napló |
| Lehetséges közvetlen szerveres adatírók | **Bizonyított:** egy emberi `roles/owner`, egy SDK-admin szolgáltatásfiók `roles/firebase.sdkAdminServiceAgent`, egy rendszerügynök `roles/firebaserules.system` rendelkezik entities create/update/delete engedéllyel | A rendszerügynök nem automatikusan üzleti szinkron; nem szabad vakon visszavonni |
| Delegálás / további jogosultság | SDK-admin principalon `roles/iam.serviceAccountTokenCreator`; owner és Firebase management agent IAM-policy módosításra is képes | Teljes kizárólagosság külön IAM/üzemeltetői döntés nélkül nem állítható |
| Felsorolható szolgáltatásfiókok | 1; nincs saját policy-binding; a kulcsmetaadat-listában 1 Google által kezelt rendszerkulcs, 0 user-managed kulcs | Privát kulcsot nem kértünk és nem olvastunk |
| Audit | **Nem ellenőrizhető:** 2026-10-01 óta 0 Commit/Write/BatchWrite naplóbejegyzés; a projekt IAM auditConfigs üres | Data Access nincs konfigurálva; a nulla találat nem bizonyít íróhiányt |
| Háttérszolgáltatások / költség | **Bizonyított:** Cloud Functions, Cloud Run és Scheduler API nem szerepel az engedélyezett API-k között; `billingEnabled:false` | Nem aktiváltunk szolgáltatást; külső projektbeli folyamat nem zárható ki |
| Google-forrás | **Bizonyított:** az ismert Attendance-táblázat és a `Mobile Attendance` fül elérhető; csak metaadat + A1:Z1 fejléc olvasva | Nincs személyes adatsor, GPS, fotó vagy nyers export átvéve |
| Forrásfejléc | 16 nem üres oszlop; Timestamp, Driver Name, DA Code, Vendor, Attendance Type, GPS/warehouse/megjegyzés/status mezők és négy autófotó | **Nincs járműazonosító vagy stabil forrásesemény-ID oszlop** |
| Google-aktiválók | **Bizonyított:** az elérhető, bejelentkezett fiók Saját aktiválók oldala 0 aktiválót mutat | Más tulajdonos privát aktiválói nem láthatók |
| Apps Script projektek | Minden projekt és Saját projektek listában ugyanaz a 8 projekt; a 7 táblázathoz kötött projekt mind Flotta-tárolóhoz kapcsolódik, a fennmaradó projekt Flotta-alkalmazás nevű | Attendance-hoz tartozó futó scriptId / GCP projectId / trigger / revízió **nem igazolt**; forrást nem futtattunk vagy szerkesztettünk |
| Valós Google → Firestore kapcsolat | **Nem ellenőrizhető / kiadás blokkolt** | A repóbeli helyőrzős `Code.gs` nem bizonyít üzemelő szinkront |

A részletes IAM-identitások és metaadatválaszok kizárólag helyi privát mentésben
maradtak. Ebben a PR-ben nincsenek e-mail-címek, kulcsok, üzleti sorok, script-
vagy magán mentésazonosítók. Google-tábla, szkript, trigger, audit-policy és
Firebase-adat nem változott.

## Elkészült fejlesztés

- `synthetic-transaction.mjs` a #29 `planAttendanceAtomicGuard` tervezőjét hívja.
  Egy teljes, legfeljebb 100 **szintetikus** eseményes QA-aggregátumból dolgozik;
  soha nem csonkítja le a történetet. Nincs sorvízjel vagy újabb párhuzamos reducer.
- Esemény beszúrása/javítása/törlése, QA-projection, forrás- és helyi revízió,
  valamint idempotencia-audit ugyanabban a valódi Firestore-tranzakcióban íródik.
- Várt revízió, pontos korábbi eseménydigest és epoch/fence ellenőrzés. Azonos
  kérés ismétlése nem ír és nem frissít időbélyeget; az eltérő tartalmú azonos ID tiltott.
  Párhuzamos írások közül egy revízió nyer; a vesztes nem alkalmazza vakon a régi változást.
- Hiányos, lejárt, jövőbeli, függő vagy sérült forrástörténet elutasított.
  Előző napi nyitott kiadás, késői visszaadás, fotókorrekció és törlés a teljes
  történetből számítódik. Több autót érintő javítás és feloldhatatlan jármű nélküli
  visszaadás a #29 szerint továbbra is blokkolt.
- `emulator-store.mjs`: kizárólag explicit `127.0.0.1:PORT` és
  `demo-imile-attendance-atomic`; nincs ADC, hitelesítő token vagy cloud fallback.
  Redirect tiltott. A célútvonalak kizárólag `qaAtomic*` gyűjtemények.
- Minden eredmény `authorizedForBooking:false`; nincs `confirmedAt`, nincs
  `trusted-attendance-projection-v1`, nincs írás az `attendance` vagy
  `attendanceVehicleGuards` gyűjteménybe. A kód nem kerül a Hosting-csomagba.

**Ez nem üzembe helyezhető központi szolgáltatás.** Az epoch és teljes-történet
jelző a kontrollált QA-forrást írja le, valós Google/IAM-hitelességet nem bizonyít.
A korlátos egy-dokumentumos QA-aggregátum nem üzemi történeti adattár. Nincs
publikus endpoint, éles bizonylat, automatikus import vagy időzített guard-életben tartás.

## Tesztek

```
node --test staging/imile-management/qa/attendance-publisher/synthetic-transaction.test.mjs
firebase emulators:exec --only firestore --project demo-imile-attendance-atomic --config firebase.attendance-qa.json "node --test staging/imile-management/qa/attendance-publisher/emulator.test.mjs"
```

28 izolált eset, 16 tényleges emulátoros tranzakciós eset. Különösen: concurrent
insert/retry, idempotencia, epoch, revízió, korrekció/törlés, fotóhiány, éjszakán
átnyúló kiadás, lejárat, crash és valódi commit-precondition rollback, tiltott cloud
célok, üres production nevű gyűjtemények. CI mindkettőt futtatja; nincs deploy.

## Jóváhagyható üzemi integrációs terv – még végrehajtás nélkül

1. **Forrásgazda:** nevezze meg a valóban futó Apps Scriptet/egyéb olvasót, futási
   principalját, GCP-projektjét, verzióját és aktiválóját. A jelen fiókból ezek
   nem bizonyítottak. Jóváhagyott stabil eseményazonosítás, javítás- és törlésjelzés
   szükséges; a tartalomból képzett régi hash és a sorszám nem stabil módosítási kulcs.
   A jármű–DA kapcsolatot nem találjuk ki a hiányzó oszlopok helyett.
2. **Egyetlen privát írási pont:** meglévő vállalati worker vagy külön jóváhagyott
   szolgáltatás; minimum jogosultság, nem nyilvános hívás, bejövő kérések hitelesítése.
   A pontos futtatási hely és költségviselő döntésre vár; Spark miatt Functions/Run
   aktiválás nem végezhető automatikusan. Nincs új IAM-szerepkör vagy kulcs készítve.
3. **Minden író sorosítása:** IAM, Admin SDK, Google-trigger és kézi/böngészős írás
   leltára, majd külön jóváhagyott fence. A jelenlegi Rules az editor/admin írást
   is engedi; még a #28-ban megmaradó **jármű nélküli Log Out** is lezárhat egy
   történetből feloldott járműhasználatot. Ezért minden érintett Attendance-változásnak
   a központi úton kell átmenni, vagy bizonyítottan külön, nem hiteles névtérbe kerülnie.
   A `source:'google_sheet'` szöveg önmagában nem hitelesítés. A Rules az IAM írókat
   nem korlátozza, az `epoch` pedig nem állít meg egy azt megkerülő IAM-írót.
4. **Hiteles generációs protokoll:** a teljes történeti alap után immutábilis,
   stabil ID-val címzett ingress javítás/tombstone és forrásgeneráció. A forrás
   változását a publikálóval sorosítani kell. Sheets-olvasás és Firestore-commit
   nem alkot közös tranzakciót; 5 perces polling + 120s TTL nem ad ilyen garanciát.
   Meg nem figyelt külső szerkesztés esetén nem szabad friss clear bizonylatot kiadni.
   Hibás/ismeretlen esemény nem dobható el csendben egy korábbi clear megtartásával:
   az ingress bizonytalanságát karantén/fence és a foglalási engedély visszavonása
   kövesse. Ennek atomi kapcsolata és Rules-szintű kapuja szintén jóváhagyandó.
5. **Atomi üzemi tranzakció:** a hiteles forrásgeneráció/fence és az érintett teljes
   történet konzisztens olvasása; az esemény, minden érintett autó projectionje,
   revízió és audit egy commitban. Eseményben/rendszámban történő javítás két autót
   érinthet; jóváhagyásig a mostani adapter ezt elutasítja. A nyitott kiadásokat
   a napváltás sem törölheti. A Flotta-claim és mai foglalás eltérésének egyeztetési
   szabálya is jóváhagyandó, nem rejthető el az Attendance-történetből.
6. **120s ablak:** későbbi újraigazolás csak újonnan bizonyított teljes generációval,
   a forrást és a projectiont egyazon tranzakcióban ellenőrizve; idempotens retry
   vagy külön guard-heartbeat nem elegendő. Ennek forrássorosítási/üzemeltetési terve
   még hiányzik; a jelen adapter nem hosszabbít meg éles bizonylatot.
7. **Döntés + visszaállítás:** same-DA, éjszakai kiadás, DST, hiányos fotó,
   jármű nélküli régi sorok; teljes privát történeti backup és restore-próba,
   késői korrekció/dupla foglalás/race QA, majd külön staging bevezetési jóváhagyás.

**Következő feladat:** a forrásgazda/üzemeltető által azonosított tényleges író és
stabil esemény/jármű megfeleltetés alapján a hiteles ingress/fence megvalósítása.
A #28/#29/#30 release-kapu addig **BLOKKOLT**; sem merge, sem telepítés nem történt.

Hivatalos háttér: [Firestore IAM](https://firebase.google.com/docs/firestore/security/iam),
[REST hitelesítés](https://firebase.google.com/docs/firestore/use-rest-api),
[Apps Script deploymentek](https://developers.google.com/apps-script/api/how-tos/manage-deployments).
