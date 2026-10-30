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
node staging/imile-management/build-preview.mjs
node staging/imile-management/session-policy.test.mjs
node staging/imile-management/entry.test.mjs
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
