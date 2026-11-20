# iMile Management – közös bejelentkezés és elkülönített staging tesztoldal

## Amit a jelenlegi fejlesztői ág tartalmaz

- Egy Firebase Authentication (Email/Password) bejelentkezés a \`staging/imile-management/index.html\` címen.
- Felhasználói engedély ellenőrzése a \`users/{uid}\` rekordban a **publikált Firestore Security Rules** mellett. Csak aktív \`admin\`, \`editor\`, \`viewer\` használhatja.
- Bejelentkezés után modulválasztó. A két staging almodul ugyanazon a **hostnéven/originen** és ugyanazon Firebase-projektben osztozik a bejelentkezési munkameneten.
- A \`depokapacitas/\` megtartja a saját, szerveroldali Firestore-szabályokkal ellenőrzött működését. Vissza lehet lépni a rendszerválasztóba; kijelentkezéskor oda irányít.
- A \`staging/imile-management/fleet/\` külön **csak olvasásra** készült, a staging Firebase \`drivers\` és \`vehicles\` rekordokat mutatja. Nem azonos a régi, éles Flotta Nyilvántartóval. Az éles flotta backendje, kliensoldali belépése és Google Apps Script kapcsolata nincs migrálva.
- A jelenlegi \`main\` ágon lévő éles flotta változatlan; a staging preview nem használja annak adatát.

## Minimális, izolált Hosting-csomag előállítása

Node.js 22 a tároló **fejlesztői ágának** gyökerében:

\`\`\`sh
node staging/imile-management/session-policy.test.mjs
node staging/imile-management/entry.test.mjs
node staging/imile-management/build-preview.mjs
\`\`\`

A build a \`preview-imile-staging/\` mappába kizárólag a fájlok megadott fehérlistáját másolja. Nem csomagolja az eredeti \`index.html\` flottát, nem másolja a \`features/\` könyvtárat, és nem helyez el benne Google Apps Script forrást vagy valós adatokat. A build már létező kimeneti könyvtárat szándékosan nem ír felül.

A teszt az előállított csomagot ellenőrzi és eltávolítja, ezért **önállóan futtatott build után** az ellenőrzéshez előbb külön, tiszta checkout vagy a generált kimenet biztonságos eltávolítása szükséges.

## Kizárólag staging Hosting preview

Az előállított könyvtár tartalmazza a szűkített \`firebase.json\` konfigurációt. A Firebase CLI-ből, a generált könyvtárból a projekt ellenőrzése és a szolgáltatás költségmentességének igazolása után lehet előnézeti csatornára telepíteni:

\`\`\`sh
cd preview-imile-staging
firebase hosting:channel:deploy imile-qa --project imile-management-staging --expires 7d
\`\`\`

**Soha ne** használd a \`firebase deploy\` parancsot éles Hosting csatornára e célból, ne a \`main\` ágat állítsd át, ne aktiválj fizetős szolgáltatást külön jóváhagyás nélkül. A preview-címhez szükséges Firebase Authentication autorizált domain-beállítást a valódi preview-cím alapján ellenőrizd.

### Élő staging tesztek (még nem igazoltak)

1. A preview URL-en Firebase email/jelszó belépés, admin \`users/{uid}\` rekord ellenőrzése.
2. Főmenü -> Flotta előnézet -> főmenü -> DepóKapacitás -> főmenü útvonal **második jelszóbekérés nélkül**.
3. Jogosulatlan / inaktív felhasználó elutasítása mindkét almodulban.
4. Csak szintetikus \`drivers\`, \`vehicles\` rekordok olvasása (mindkét modul ugyanazokat látja).
5. A DepóKapacitás beosztásmentése és törlése kizárólag mesterséges rekordokkal; Firestore Rules felülvizsgálata.
6. Kijelentkezés után minden modulból vissza a közös belépéshez.
7. Mobilos megjelenés, hibás hálózat, vissza gomb és újratöltés ellenőrzése.

## Korlátok

Ez **nem** a teljes Flotta Nyilvántartó Firebase-migrációja. Nincs éles flottatörzs-átvitel, nincs közös szerveroldali flottaszerkesztés és nincs valódi Attendance import. A régi Fleet teljes funkcionalitása jelenleg csak a külön éles rendszeren érhető el. A staging előnézeti kód és a kizárólag kódszintű tesztek nem bizonyítják a teljes böngészős E2E működést. A bevezetéshez a külön GO/NO-GO kritériumok teljesítése szükséges.


## 2026-10-30 – Funkcionális QA, Work-keret elfogyása után

Az utolsó **igazolt** Work-jelentés: 8/8 sikeres böngészős belépési és modulváltási ellenőrzés. A később indított, futár–autó–kapacitás–foglalás funkcionális teszt Work-befejezési jelentése nem érhető el innen; annak tényleges utolsó lépése nem igazolt.

**Megtalált alkalmazáskorlát:** a DepóKapacitás \`saveForm('driver')\` és \`saveForm('vehicle')\` ága szándékosan tiltja a közös törzsek módosítását. A korábbi Work-utasításban kért első szintetikus rekordok ezért nem hozhatók létre közvetlenül a DepóKapacitás felületéről.

### Új, admin által kézzel indított staging QA előkészítő

- Staging rendszerválasztó admin-menüje: \`staging/imile-management/qa/index.html\`.
- Kizárólag az \`imile-management-staging\` Firebase-projekten, aktív \`admin\` szerepkörrel működik, további Firestore Security Rules védelemmel.
- Gombnyomással és megerősítéssel, kizárólag hiányzó rekordok esetén létrehozható:
  - \`drivers/SYNTHETIC_TEST\`: \`name="Tesztfutár (mesterséges)"\`, \`daCode="SYNTHETIC_TEST"\`, \`vendor="QA"\`, \`capacity=100\`, \`active=true\`.
  - \`vehicles/TESTCAR01\`: \`plate="TESTCAR01"\`, \`model="SYNTHETIC QA"\`, \`status="Elérhető"\`.
- Az előkészítő nem hoz létre foglalást vagy jelenléti rekordot és semmit nem ír felül.
- A törzs \`drivers\` és \`vehicles\` törlését a publikált Firestore Rules tiltja. A tesztadatok fennmaradhatnak, és törlésükhöz a projekt jogosult adminisztratív Firebase Console/IAM útvonala szükséges.
- A QA útvonalat a \`build-preview.mjs\` előnézeti csomagolójához hozzáadtuk; a **korábbi Firebase Hosting preview-kiadás automatikusan nem frissül**, a megváltozott fájlokat csak ellenőrzött újbóli preview-deploy teszi elérhetővé.

### Következő ellenőrzés, új telepítés után

1. Közös bejelentkezés adminnal, majd admin QA menü megjelenése.
2. Ellenőrizd, hogy a két szintetikus dokumentum még nem létezik; külön jóváhagyás után létrehozás.
3. Flotta Firestore-előnézet és DepóKapacitás futár/autó listák megjelenése.
4. DepóKapacitásban driverCapacities/SYNTHETIC_TEST értékének 100-ra állítása, egy jövőbeli napra egyetlen booking + driverClaims mentés.
5. Ugyanarra a napra második futár-/autófoglalás tiltásának tesztje, valamint a napi kapacitás ellenőrzése.
6. A foglalás feloldása, booking és driverClaim eltűnésének ellenőrzése.
7. Visszamaradó teszt-törzsadatok tételes dokumentálása.

A GitHub-fájlok módosítása **nem egyenlő** a Hosting preview publikálásával, és nem jelent valós funkcionális E2E eredményt.


## 2026-10-30 – Egykattintásos, visszavonható foglalási próba

A \`staging/imile-management/qa/\` adminfelületen a külön engedélyezett mesterséges futár és tesztautó megléte után megjelenik a **Teljes staging foglalási teszt indítása** gomb. Az oldal nem futtat tesztet automatikusan, és mentés előtt felhasználói jóváhagyást kér.

A próba **kizárólag** az \`imile-management-staging\` projekten fut, a következő rögzített azonosítókkal:

- \`drivers/SYNTHETIC_TEST\` és \`vehicles/TESTCAR01\` – már létező, csak mesterséges törzsrekordok;
- \`driverCapacities/SYNTHETIC_TEST\` – 100-as kapacitás, ha korábban nem volt ilyen; a próba végeztével a teszt által létrehozott rekord törlődik;
- \`bookings/2099-01-15__TESTCAR01\` – egyetlen mesterséges foglalás, 100 csomag kapacitással;
- \`driverClaims/2099-01-15__SYNTHETIC_TEST\` – a foglaláshoz tartozó egyetlen zárolás.

**Próbamenet:** profil és azonosítók ellenőrzése; kapacitás mentése és visszaolvasása; foglalás + zárolás atomikus tranzakciója; kapacitás ellenőrzése; a két meglévő dokumentum felülírásának szerveroldali tiltási próbája; a foglalás és zárolás együttes feloldása; visszaolvasás és az ideiglenes kapacitás törlése.

A dupla foglalás két *felülírási* szándékkal kerül tesztelésre. Ez nem helyettesíti a külön autóval vagy futárral próbált ütközési helyzetek teljes körű emulátoros ellenőrzését (azt a Work korábban 65/65 teszttel lefuttatta). Nincsen éles adatírás és nem történik automatikus import.

Az oldal rögzíti a sikeres és sikertelen lépéseket. Visszavonás során **csak a pontosan egyező tesztdokumentumokat** próbálja törölni; ha ez nem sikerül, kiírja a lehetséges visszamaradt azonosítókat. A \`drivers\` és \`vehicles\` közös törzsét a korábbi Firestore Security Rules szerint **nem lehet kliensoldalról törölni**. Ezek megmaradnak, amíg jogosult Firebase Console/IAM művelettel külön el nem távolítják őket.

Új automatikus tesztek:

\`\`\`sh
node staging/imile-management/qa/functional-flow.test.mjs
node staging/imile-management/qa/run-flow.test.mjs
node staging/imile-management/entry.test.mjs
\`\`\`

A \`run-flow.test.mjs\` izolált, memóriabeli **mock Firestore**; nem éles Firestore/Rules emulátor, és nem állít elő publikus előnézeti oldalt. A Firebase Hosting korábbi preview-csatornáját az új verzióra újra kell telepíteni. Nincsen automatikus, engedély nélkül futó publikus deployment.
