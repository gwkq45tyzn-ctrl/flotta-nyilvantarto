# iMile Management V1 – közös műszaki tudás, kettős független audit és élesítési kapu

**Kiadás:** 2026-11-03 · **Tulajdonosi döntés:** végleges élesítéshez **külön Grok GO, külön ChatGPT GO, majd a felhasználó kifejezett engedélye** szükséges. **Aktuális eredmény: NO-GO.** Ezt a dokumentumot mindkét fejlesztő/auditor kötelező közös munkaforrásként használja.

> Ez a GitHub dokumentum teljes **projekt**-technikai és működési információátadásra törekszik, nem jelent automatikus hozzáférést a privát ChatGPT-beszélgetésekhez, bizalmas Excel-exportokhoz, felhős fiókokhoz vagy jelszavakhoz. Személyes csomagadatokat, magánszemélyek adatait és titkokat nem szabad nyilvános issue-ba/PR-be írni.

## 0. Kritikus döntési szabály – három külön jóváhagyás

1. **Grok önálló auditja**: ugyanazt a végleges release candidate Git commit SHA-t és ugyanazt a kiadandó web-/Rules-/migrációs csomagot ellenőrzi végig. Írásos **GO vagy NO-GO**, részletes ellenőrzési tételekkel, tényleges eredményekkel, pontos bizonyítékokkal, nyitott kockázatokkal. Nem ismételheti kritikátlanul a ChatGPT jelentését.
2. **ChatGPT önálló auditja**: megismétli az összes kritikus ellenőrzést ugyanarra a SHA-ra. Saját pozitív/negatív teszteket, GitHub Actions logot, diffet, ütközést, Apps Script/Flotta adatbiztonságot, üzleti egyezőséget és érintett forrásrendszereket vizsgál. Nem ismételheti kritikátlanul Grok jelentését.
3. **Felhasználói explicit élesítési GO**, **csak** a két független GO után, azonos SHA + azonos release artifact/szabályfájl/migrációs terv és konkrét környezet megnevezésével. A felhasználó GO-ja nem pótolja a két műszaki GO-t. A két műszaki GO nem pótolja a felhasználó engedélyét.

**Bármely NO-GO, hiányzó vagy ellentmondó bizonyíték, SHA/artifact eltérés, új változtatás az audit után, megoldatlan súlyos bug, valódi engedély vagy backup hiánya = RELEASE STOP.** Új commit után a korábbi mindkét GO érvényét veszti a módosult kiadásra, és újra kell ellenőrizni.

**Fontos:** Grok és ChatGPT GitHub-műveletei ugyanahhoz a csatlakoztatott GitHub-felhasználóhoz tartozhatnak. Két külön ügynök-jelentés **nem** két kriptográfiailag független GitHub-felhasználói jóváhagyás. A strukturált release-sablon/ellenőrző szkript csak következetességet vizsgál; a két önálló jelentés hitelességét és a felhasználó engedélyét a beszélgetésben külön kell megerősíteni. Semmi nem telepíthető pusztán azért, mert a tesztek vagy egy JSON állapota zöld.

## 1. Mérvadó források és jelenlegi ágak

- Felhasználói üzleti döntések: **[#67 – iMile Management V1 követelmények](https://github.com/gwkq45tyzn-ctrl/flotta-nyilvantarto/issues/67)**.
- Teljes történeti műszaki kontextus: **[Grok master handover, 11 fejezet + QA-kiegészítések](https://github.com/gwkq45tyzn-ctrl/flotta-nyilvantarto/blob/docs/imile-grok-master-context-20261103/docs/IMILE_GROK_MASTER_CONTEXT_2026-11-03.md)** (a régi állapotokat **nem** szabad jelenlegi ténynek tekinteni).
- Az aktuális **egyesített fejlesztési alap:** **[PR #79](https://github.com/gwkq45tyzn-ctrl/flotta-nyilvantarto/pull/79)**, ág \`integration/imile-v1-unified-20261103\`, a feljegyzés készítésekor HEAD \`14e0ff7361110c8f2e41770b8c65ca1e93f812f8\` (ellenőrizni kell az aktuális refet).
- Grok biztonsági ág: **[PR #81](https://github.com/gwkq45tyzn-ctrl/flotta-nyilvantarto/pull/81)**, \`grok/v1-security-migration-20261103\`, HEAD \`e45001775fc6d727fdc3dac6546a4d19698ed414\`.
- ChatGPT külön QA javítása Grok ágára: **[PR #82](https://github.com/gwkq45tyzn-ctrl/flotta-nyilvantarto/pull/82)**, \`qa/migration-manifest-nested-hash-20261103\`, HEAD \`cb1ea15b58322a73e903f0535d49a88af73aca08\`.
- **[#80 – Grok folyamatos Security/Migration workstream](https://github.com/gwkq45tyzn-ctrl/flotta-nyilvantarto/issues/80)**; ezzel koordináljon, ne nyisson újabb hasonló, elszigetelt munkát.
- Eredeti Flotta-híd: [PR #72](https://github.com/gwkq45tyzn-ctrl/flotta-nyilvantarto/pull/72); korábbi QA-k: #73, #75, #76, #77, #78.
- Riportok teljes üzleti/Excel-szerződése: [REPORTS_AND_STATS_SPEC_HU.md](../staging/imile-management/reports/REPORTS_AND_STATS_SPEC_HU.md).
- Aktuális összevont modul QA: [IMILE_V1_UNIFIED_INTEGRATION_QA.md](./IMILE_V1_UNIFIED_INTEGRATION_QA.md).
- Felhős Rules és éles állapot **külön** ellenőrizendő a tényleges Firebase-projektből. A GitHub fájl nem bizonyít sikeres Rules/Hosting deployt.

**Forrásütközésben az explicit felhasználói döntés + tényleges jelenlegi forráskód és mért teszt eredménye az irányadó.** Korábbi beszámoló, régi doc, zöld általános CI vagy modellállítás önmagában nem bizonyít működő új funkciót.

## 2. Teljes V1 funkcionális scope – nem szabad leszűkíteni csak a Flottára

### A. Az eredeti Flotta
- A **teljes eredeti \`index.html\` marad meg** és érhető el a közös menüből. Nem váltható le a \`staging/imile-management/fleet/index.html\` egyszerűsített felülettel.
- Járművek, futárok, tankolókártyák, kontaktok, kiadás-visszavétel, szerviz, biztosítás, bérlet/lejárat, telefonszám/kártya, kilométeróra, hozzárendelések, megjegyzések, összes eredeti előzmény és extra mező paritása kötelező.
- Firestore compat bridge: érvényes Firebase Auth, aktív server-fetched \`users/{uid}\` profil, eredeti legacy \`fleetmanager\` munkamenet nem elég. Import előtti UI read-only, helyi export/backup megőrzendő.
- Firestore \`onSnapshot\` adatcsak szerver-visszaigazolt (nem \`fromCache\`, nem \`hasPendingWrites\`), párhuzamos mentés/revízióvédelem és nem végtelen retry. Tartós conflict esetén pending adat visszaállítható.
- A hardkódolt \`flotta_migration_token='verified-import'\` **nem hiteles migrációs engedély**. Az Apps Script kettős szinkront cutoverkor kontrolláltan kell megszüntetni.

### B. DepóKapacitás, raktár és napi operáció
- AKE napi működés: reggeli ~06:00 nyitás, tipikusan 800–1000 csomag; előző napi linehaul, irányítószám/kerület rendezés, FIFO újrakézbesítés, csomag-ne-maradjon-a-raktárban, készlet és hosszú ageing vizsgálat, BTD NDR/Resort, ügyfélticket, futár/DA jelenlét, autóállapot és munkaerő-egyeztetés.
- Kerületenként napi **új + reattempt** csomagigény \`nap + normalizált tracking ID\` deduplikációval; tervezett vs megerősített futárkapacitás; hiány és többlet képletei; az önmagában pozitív többlet nem hiba. Napi futár/autó allokáció és tranzakcionális foglalás; vállalkozók és külsős diákok **nem kapnak belépést** a belső portálba.
- Diákok heti előretervezése fontos, külön külső önkiszolgáló jelenléti/PWA rendszer viszont NEM V1 belső admin scope.
- KPI-kontextus: P90 Ascan→Delivered <3 nap; 12H linehaul pickup ≥98%; 24H OFD ≥96%; 36H Delivered ≥92%; pending OFD <3%. A napi 10 órai export nem végleges napi teljesítmény.
- V1 jelenlegi új funkció: **csak olvasható, server-confirmed Flotta törzstükör + \`master-reconciliation\`**: DA és jármű exact-field eltérések, orphan rekordok, veszélyeztetett foglalások, stale/offline/pending esetben fail-closed. **Ettől még NINCS authoritative közös törzs/szinkron!**

### C. Riportok
- In-Hub Inventory: \`Waybill Number\`, \`LM Receive Date\`, \`Consignee city\`, \`Consignee zipcode\`; hiányzó kerület helyett település neve; egyedi Waybill (duplikátum nem csendben összeadva); dátumos oszlopok + Grand Total, eredeti Excel-színek/stílus.
- OFD Monitoring: \`OFD Date, DA, DA Code, Vendor, Station, OFD, Delivered\`; azonos kulcs \`date+station+DA Code+vendor\` sorai szándékosan összegezendők. \`Dld%=Delivered/OFD\`, \`P90 Target=OFD*.90-Delivered\`, vállalkozó weighted \`SUM Delivered/SUM OFD\`, \`SPR=Total OFD/distinct DA\`. District csak ellenőrzött mappingból, nem kitalálva. Excel sheet1 nyers + sheet2 mintával egyező generálás, letöltés.
- A 10 óra körüli snapshot **provisional**, egy későbbi final státusz külön jóváhagyást igényel; statisztika és napi import idempotencia/forrásverzió fontos.
- A jelenlegi staging böngészős Excel-eszköz QA-hoz készült: a teljes valós üzemi adatkezelés, belső dependency-bundle, pontos vizuális 1:1 és source data kontroll külön auditkapu.

### D. Scope és korlátok
- **V1 desktop first** (Chrome/Edge 1366×900 és 1920×1080); a közös belső Firebase account alias \`imilemanagement\`, az engedélyezett e-mail \`imilemanagement@imile-management-staging.firebaseapp.com\`; **nem hozunk létre másik belső Auth-fiókot**. A valódi UID-t csak hitelesített, jogosult környezetből lehet megtudni, nyilvános dokumentumba nem szükséges kiírni.
- Későbbi: attendance PWA/diákos jelenlét, autó-check-in/kulcsláda/fotó/napi vezetői kontroll, rendszámfelismerés, 150 m geokerítés. A feature Rules tartalmazhatja, de nem kapcsolhatjuk be és nem engedhetünk új courier-auth utat V1-ben jóváhagyás és külön biztonsági terv nélkül.
- **0 Ft / Firebase Spark + díjmentes Google eszközök**, nem kérhető Blaze, bankkártya, külön IT/vezetői jóváhagyás vagy annak megkerülése. A vállalati adatkezelési jogosultság ettől függetlenül kötelező.

## 3. Meglévő tesztbizonyíték – ne általánosítsuk túl

**#79 integráció, azonos \`14e0ff7\` HEAD**:
- [Flotta synthetic bridge – SUCCESS](https://github.com/gwkq45tyzn-ctrl/flotta-nyilvantarto/actions/runs/41712374240).
- [Depó-kód/biztonság – SUCCESS](https://github.com/gwkq45tyzn-ctrl/flotta-nyilvantarto/actions/runs/41712374254).
- [Staging riport/Auth/Rules-emulátor/preview – SUCCESS](https://github.com/gwkq45tyzn-ctrl/flotta-nyilvantarto/actions/runs/41712374257).

**#82 Grok-rules + ChatGPT migrációs patch, azonos \`cb1ea15\` HEAD**:
- [Grok security QA + valódi Firebase-emulátoros szintetikus UID-tesztek – SUCCESS](https://github.com/gwkq45tyzn-ctrl/flotta-nyilvantarto/actions/runs/41714033100).
- [Depó CI – SUCCESS](https://github.com/gwkq45tyzn-ctrl/flotta-nyilvantarto/actions/runs/41714021154).
- **[Teljes staging integration – FAIL](https://github.com/gwkq45tyzn-ctrl/flotta-nyilvantarto/actions/runs/41714033057)**: két *pozitív* Attendance vehicle tesztet az összevezetett feature Rules elutasított. A feature-rules új \`!('vehicleId' in request.resource.data)\` guardja eltér a korábbi V1-től. Ez tényleges szabályzatütközés; **ne oldjuk meg automatikus jogosultsági lazítással**. A V1 Attendance-specifikációt és a későbbi PWA-útvonalakat el kell választani, majd teljes negatív+pozitív teszteket ismételni.

A \`features/migration-manifest.test.mjs\` Grok előző \`JSON.stringify(obj,Object.keys(obj).sort())\` hashelése hibás: nested driver/vehicle objektumok mezői kiestek. #82 kész \`features/migration-manifest.mjs\` teljes rekurzív hash / nested regressziós javítással. Az offline hash **nem** szerveroldali hitelesítés; a JSON-size budget **nem** hiteles Firestore dokumentumméret.

## 4. Kötelező teljes auditmátrix – MINDKÉT auditor

| Kapu | Kötelező bizonyíték |
| --- | --- |
| S1: változat + teljes kör | azonos commit/hosting artifact hash/rules hash, diff, fájlok, minden modul és eredeti Fleet parity |
| S2: Auth/UID | egyetlen engedélyezett belső UID Rules *minden belső kollekcióban*; más e-mail, más UID, inaktív role, viewer, offline, revoked access DENY |
| S3: Firestore Rules | teljes feature-vs-V1 sémakompatibilitás, Rules-emulátor allow/deny per kollekció, read/query/write, transactions, locks, cross-user, revízió, privacy |
| S4: adatvesztés elleni védelem | teljes régi Fleet + pending + Apps Script + history private backup; hash/counts/parity, reimport és rollback próba; 1 MiB valódi méretmérés |
| S5: valós idejű szinkron | két valódi, külön Chrome/Edge példány vagy külön session staging Firebase-en, kétgépes írás/olvasás/conflict/offline/restore; mock-only nem elég |
| S6: Flotta üzleti paritás | minden eredeti entitás, mező, előzmény, státusz, autókiadás/visszavétel/lejárat; Apps Script dual-sync cutover idején hard stop |
| S7: Depó + közös törzs | DA-code/rendszám normalizáció, valós canonical source of truth és szervertranzakciós műveletek; orphan/dupla/stale/foglalási ütközés |
| S8: In-Hub és OFD | valós mintákhoz hasonlított 1:1 export, vezető nullák, hibás adat, egyedi/összegzett kulcsok, képletek, stílus, provisional/final |
| S9: teljes desktop E2E | belépés, navigáció, Flotta/Depó/riport cross-page, újratöltés, kijelentkezés, hálózatkimaradás, műveletek teljes köre |
| S10: üzemeltetés/megfelelés | Spark kvóta, privát adatkezelés, titokmentes repo, logging, monitoring, mentés/rollback, átállási terv, tulajdonosi jóváhagyás |
| S11: kiadási minőség | teljes CI mindhárom modulra ugyanazon SHA-n SUCCESS; nincsenek figyelmen kívül hagyott piros tesztek, nyitott kritikus hibák vagy pending approval |
| S12: külön jövőbeli funkciók | Attendance PWA, képfeltöltés, courierAuth, Cloud Functions/Blaze és egyéb nem V1-hez tartozó feature nem válik véletlenül elérhetővé |

**Minden tételhez:** vizsgált fájl/commit, tesztparancs, GitHub Actions run URL, eredmény, bizonyossági szint (S statikus, T unit, E emulator, B browser, L live staging, N nem igazolt), blocker és felelős. Nem írható „GO”, ha a tétel csak mock/szintetikus bizonyítékon áll, de éles működésre vonatkozik.

## 5. Munkamegosztás és átadás

**Grok:** önálló \`grok/\` branch + Draft PR a #79 integration ág felé, #80 workstreamből folytat: teljes V1 Rules különválasztás / UID policy, feature regression fix, külön E2E, migráció server-verified design/1MiB, teljes önálló audit. **Ne álljon meg egy commit vagy QA után, ne várjon választ olyan feladatra, amelyet maga is biztonságosan elvégezhet.**

**ChatGPT:** #79 integráció/Depó/riport üzleti egyezőség, regressziós tesztek, összevezetett állapot független QA, élesítés előtti második teljes audit. Külön branch és PR, ha Grok ágat ellenőrzi. Kétirányú review kötelező: **Grok is nézze át a ChatGPT minden integrációs módosítását, a ChatGPT is nézze át Grok minden security/migration javítását**.

**Befejezés:** Grok és ChatGPT külön teljes, legalább a S1–S12 elemeket lefedő release-értékelést készít *ugyanarra a fagyasztott candidate SHA-ra*, megjelöli saját GO/NO-GO állapotát, konkrét open blockers, action items, teszt run ID-k és aktív deployed Firebase állapotok listáját. A másik fél véleménye nem válthatja ki a saját vizsgálatot. **Éles GO előtt új commit -> mindkét audit ismétlés.**

## 6. Fennmaradó STOP és jelenlegi döntés

**GROK: NO-GO. CHATGPT: NO-GO. FELHASZNÁLÓI ÉLESÍTÉS: NINCS MEGADVA.**

- Grok #81 Rules UID-je placeholder, és a többi \`member()\` belső collection nem single-UID-re zárt; külső courierAuth feature útvonalak is jelen vannak.
- #82 teljes staging CI regressziót talál Attendance mezőengedélyeknél, ezért nem regressziómentes.
- Nincs élő kétböngészős Firebase E2E, felhős Rules ellenőrzött publikálása, hiteles server-verifikált migráció, privát backup+rollback, hiteles 1 MiB méretmérés.
- A közös Fleet/Depó master még read-only projekció és reconciliation, a tényleges authoritative write path nem éles.
- Teljes eredeti Flotta üzemi adat importját és Apps Script kikapcsolását nem végeztük el.

**Nem telepítünk, nem publikálunk Rules-t, nem migrálunk valódi adatot, nem kapcsolunk fizetős szolgáltatást a felhasználó kifejezett, verzióhoz kötött élesítési engedélye előtt.** A felhasználó engedélye **csak a két bizonyított független GO után** kérhető.

## 7. Release jóváhagyási sablon

A konkrét candidate SHA, azonos artifact és Rules SHA, a Grok és ChatGPT külön auditja, valamint a felhasználói élesítési engedélye a \`docs/IMILE_V1_RELEASE_APPROVAL_TEMPLATE.json\` struktúrájában dokumentálható. A \`tools/verify-imile-v1-release-gate.mjs\` lokálisan **csak szerkezeti konzisztenciát vizsgál**, nem igazolja az aláíró személyét és nem ad telepítési jogosultságot. A kitöltetlen sablon kötelezően STOP.
