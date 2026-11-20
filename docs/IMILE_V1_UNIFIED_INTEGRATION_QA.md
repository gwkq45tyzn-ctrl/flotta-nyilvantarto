# iMile Management V1 – közös integráció és eltérésvizsgálat

Dátum: 2026-11-03. Ág: `integration/imile-v1-unified-20261103`. PR: #79. Státusz: **staging QA-kész / éles NO-GO**.

## Tényleges integráció
- Az **eredeti Flotta** változatlan teljes `index.html` + korábbi ellenőrzött Firestore híd, valamint a **fejlett Depó** és **In-Hub/OFD** helyi Excel-riportok egy kódbázisban.
- Közös Firebase staging fiók, role check és közös rendszerválasztó.
- A Depó sidebarban **Közös Flotta-törzs (előnézet)**: szerver-visszaigazolt `flottaSharedState/current` snapshot canonical exact-field projekciója, nem történik automatikus adatírás/foglalás.
- **Új:** `master-reconciliation.mjs` összeveti a Flotta és a Depó `drivers`/`vehicles` adatait és aktív `bookings` rekordjait. Megjeleníti az egyező, eltérő, egyik rendszerben hiányzó rekordokat és a Flotta-státusszal ütköző futár/autó foglalásokat. **NEM ír**, nem igazol migrációt.
- Összehasonlítás kizárólag a Depó `drivers`, `vehicles`, `bookings` szerver-visszaigazolt, cache- és pending-mentes adataival. Különben `waiting`/NO-GO. A Flotta forrás is csak confirmed server snapshot lehet.
- A read-only kimenet csak kanonikus mezőket és azonosítókat tartalmaz: nincs telefonszám, biztosítás, tankolókártya, belső history, private sidecar a diffben.

## CI és tényleges bizonyíték
- [Depó kód/biztonság – sikeres](https://github.com/gwkq45tyzn-ctrl/flotta-nyilvantarto/actions/runs/41711801819)
- [Flotta Firestore Bridge synthetic – sikeres](https://github.com/gwkq45tyzn-ctrl/flotta-nyilvantarto/actions/runs/41711801863)
- [Teljes staging + emulátoros jogosultság + riport + új eltérésvizsgálat + izolált preview – sikeres](https://github.com/gwkq45tyzn-ctrl/flotta-nyilvantarto/actions/runs/41711801677)
- Parancs: `node depokapacitas/master-reconciliation.test.mjs`; `node depokapacitas/flotta-master-readonly.test.mjs`. Automatikus workflow: `.github/workflows/imile-staging.yml`.

## Külön Grok munkasorozat
[Grok autonóm feladat #80](https://github.com/gwkq45tyzn-ctrl/flotta-nyilvantarto/issues/80): teljes Firestore Rules összevezetés és egy UID, Auth + Rules emulator tesztek, hiteles szerveroldali migrációs manifest/rollback + 1 MiB-limit, független kétböngészős szintetikus teszt, saját Grok ágon.

A Grok **még nem indul el automatikusan** a GitHub issue létrehozásától. A felhasználónak külön el kell küldenie a #80 issue linkjét a Groknak.

## V1 GO/NO-GO
**Éles NO-GO**: jelenleg nincs hiteles és jóváhagyott Flotta-migráció, telepített teljes/egyetlen-UID Rules, élő kétböngészős Firebase Auth+Firestore E2E és automatikusan összevezetett, valós adatokra jóváhagyott source-of-truth modell. A jelenlegi diff csak ellenőrző felület. Az izolált preview artifact NEM tartalmazza a teljes eredeti Flottát.

Nem történt Rules/Hosting éles deploy, üzemi adatírás vagy fizetős eszköz aktiválása.
