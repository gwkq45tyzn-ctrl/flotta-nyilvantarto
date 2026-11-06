# iMile Management – szűkített, GO-ra előkészített V1 (2026-11-04)

**Jelenlegi állapot: NO-GO.** A funkciók szűkítése nem jelent biztonsági felmentést, élesítési jogot vagy valós hozzáférés bizonyítását.

## Kiadásban maradó, kötelező funkciók
- A meglévő, **eredeti** `index.html` Flotta teljes működése, szerkezete, régi adatai, szerviz-, biztosítás-, okmány-, futár-, autó-, kártya- és eseménytörténete. A staging Flotta-prototípus NEM helyettesítő.
- Egyetlen belső Auth-fiók, pontosan egy rögzített UID és szerveroldali Firestore Rules; jogosulatlan, inaktív vagy visszavont fiókok elutasítása.
- DepóKapacitás alapfunkciók: kerületi új + reattempt igény, FIFO és deduplikáció, tervezett/megerősített kapacitás, foglalás és kiadás/kiadási ütközésvédelem.
- Eredeti Flotta és Depó közös, **kanonikus** futár-/autó-/foglalási adatfolyamai, két asztali gépen szerver-visszaigazolt valós idejű állapot.
- A valós korábbi adatok ellenőrizhető, privát mentése, pending/conflict állapot leltára, adat- és történeti egyezés, migrációs dry-run és helyreállítási próba.
- Apps Script kettős írás kizárása a teljes régi klienskészletre. A kliensoldali `gateOldSync()` no-op nem szerveroldali hard stop. Az éles átállításhoz külön tulajdonosi engedély szükséges.
- Ingyenes (0 Ft), jogosultan használható eszközök; nincs Blaze, Cloud Functions/Storage vagy IT-/vezetői jogosultság megkerülése.

## Kifejezetten V1.1-re halasztva
- OFD Monitoring, In-Hub Inventory, 1:1 Excel export, riport-adatbázis és statisztika.
- Attendance PWA, fotófeltöltés, külső futár/diák önkiszolgáló fiók, courier autókiadás és egyéb fizetős vagy jóváhagyást igénylő funkciók.
- A Work #87 Draft PR megmarad, **nem kerül** a szűkített V1 kiadási csomagjába.

## Az S1–S12 kapuk értelmezése
- **S1–S7, S9–S11**: változatlanul kötelező, objektív, teljes kiadási bizonyítékkal.
- **S8**: az OFD/In-Hub riportfunkciókat kifejezetten kizárjuk a V1 artifactból; a V1.1 1:1 riporttesztje nem blokkolja a V1-et. A kizárás maga ellenőrzendő.
- **S12**: a courier/PWA/Attendance **üzleti funkciója** nem része a V1-nek, de **a deaktiváltság szerveroldali bizonyítása kötelező biztonsági kapu**. Restricted Rules `courier() == false`, nem engedélyezett UID-kkel negatív Firestore-emulátoros próbák és a kiadási csomagból való kizárás nélkül nincs GO. Ezt nem szabad N/A-ként automatikusan elfogadni.
- Az S1 artifact- és Rules-hash, Grok önálló GO, ChatGPT önálló GO és a felhasználó **külön, utólagos explicit engedélye** változatlan feltétel.
- A `docs/IMILE_V1_RELEASE_APPROVAL_TEMPLATE.json` marad `PENDING/BLOCKED` mindaddig, amíg valódi kiadási bizonyíték nincs.

## Jelenleg bizonyított és nem bizonyított
- Szintetikus, helyi Chromium+Firebase emulátor: eredeti Flotta login, párhuzamos revízió, offline/revoked védelem (lásd #86).
- Offline, rekurzív migrációs hash/Firestore méret-előellenőrzés (#88), de ez NEM valós, teljes backup + migráció.
- CI-ben automatikus telepítés kizárása (#89), Depó összesített forrásjelzés (#90).
- **MÉG HIÁNYZIK:** valódi UID/Rules jogosultság hivatalos staging tesztje, privát visszaállítható biztonsági mentés, canonical Flotta–Depó közös írások, valódi többgépes felhős böngészőteszt, Apps Script végpont és régi kliensek tényleges biztonságos átállítása, kiadási artifact freeze/hashes.

## Csomagolás és élesítési tilalom
A `build-v1-core.mjs` kizárólag egy **offline, nem telepíthető QA forráscsomagot** készít, amely tartalmazza az eredeti Flotta forrását. Ezt nem szabad összekeverni sem a régi staging `build-preview.mjs` csomagjával, sem egy jóváhagyott production release-szel. A csomag építése önmagában NEM GO, NEM valódi E2E és NEM üzembe helyezési engedély.

**NO-GO.** A két független auditor ugyanazt a végleges SHA-t/Rules-t/artifactot ellenőrzi. Amíg ez nincs meg, nincs automatikus merge, Firebase deploy vagy valós adatimport.
