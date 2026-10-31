# iMile – csak olvasó forrásellenőrzés (PR #15)

**Alap:** PR #14, `e834079593a3909a9468df559948278db8945d18`. Ez a fejlesztés **nem** éles vagy staging felhőtelepítés.

## Mit tud az új modul?

A `server/readonly-source-preflight.mjs` egy megadott, memóriaalapú
forrásmátrixot ellenőriz a Workben megfigyelt In-Hub (26 oszlop) vagy
OFD Monitoring (35 oszlop) sémával. Kifejezetten megadandó a
`{date, station}` nap+depó kiválasztás.

- **In-Hub:** a teljes fájlban ellenőrzi az azonosítókat, az érvényes
  érkezési dátumokat, a kerület/település mezőt és az azonos waybill
  duplikációját. A megadott napra és depóra visszaadja a csomagok,
  a területek és az érkezési napok számát. Egy többdepós exportból
  csak a **kifejezetten kért** depót mutatja; a többi depó hibás
  sorát sem hallgatja el.
- **OFD:** a teljes nyers export minden sorát és az azonos nap+depó
  alatt egyedi DA/vállalkozó kapcsolatot vizsgálja. A kiválasztott
  csoporthoz OFD, Delivered és egyedi futárszám készül. A többi
  állomás eredményét nem adja hozzá.
- **Egyeztetés:** ha ellenőrzendő aggregátumot is kap, a
  `reconcileWithRawExport` modul segítségével a teljes kiválasztott
  forráscsoportot veti vele össze. Egy részleges futárlista nem
  fogadható el teljes csoportnak.
- **Hibajavítási sorlista:** kizárólag Excel-sorszám és
  hibakód. Hibás budapesti irányítószám: `invalid_budapest_postcode`.
  A hiányzó vagy nem megfelelő típusú azonosító, forrástípus,
  duplikáció és a nem egyező candidate külön blokkolási ok.
  A legelső 100 javítandó sor jelenik meg; az elmaradó sorok száma
  külön szerepel. A rendszer nem módosítja a nyers fájlt.
- **Adatminimalizálás:** a visszaadott objektumban nincs waybill,
  ügyfélcím, DA-kód, futárnév vagy vállalkozónév; nincs fájlrendszeri,
  Firestore- vagy HTTP-művelet.
- **Erőforrásvédelem:** max. 10 002 sor, 100 oszlop,
  150 000 cella, 4 MiB cellaszöveg és 4096 byte/cella.
  Ez fejlesztési tesztkorlát, nem adatgazda által jóváhagyott
  üzemi kapacitás.

## Példafolyamat, nem telepített funkció

1. Az engedélyezett belső feldolgozó memóriában előállítja a
   26/35 oszlopos mátrixot. A nyers fájl nem kerül GitHubra.
2. A depóvezető megadja az állomást és a napot (pl. DS(AKE)
   és a tényleges, ellenőrzött riportnap).
3. A funkció elutasítja a forráshibát; a sorindexet
   tartalmazó hibalista alapján a forrás adatgazdája javít.
4. Javítás után **új exportot** kell ismét betölteni és
   az összes sorral újraellenőrizni. Hibás sorok kihagyása vagy
   kerület kitalálása tilos.
5. Kizárólag a tiszta, teljes, depóra kiválasztott aggregátum
   lehet egy későbbi **adatgazda által jóváhagyott**
   szerveres import bemenete.

## Korlát: ez NEM független szolgáltatói forrásigazolás

A bemeneti mátrixot a meghívó adja át. Az ellenőrzés bizonyítja a
belső séma/összesítés-egyezést, de **nem bizonyítja**, hogy a fájl
iMile-tól érkezett, nap végén teljes, nem módosított vagy üzletileg
végleges. Nincs még éles nyers Excel-adatátvételi integráció,
Firebase-mentési hívás, használatban lévő felület vagy publikált API.

**Nyitott adatgazdai döntések:** Delivered és History Delivered;
azonos DA ismételt sorának összeadhatósága; napi 10:00
pillanatkép kontra végleges állapot; többdepós és részleges
export kiválasztási szabályai; forrásfrissesség és nap/időzóna;
kerület/település és ID-azonosság; hibás budapesti irányítószámok
forrásadat-javítása; vállalati személyesadat-kezelés és privát
szerver/üzemeltetési jóváhagyás.

A PR #14 és #12 réteges fejlesztés. Az éles Flotta, a
`main`, a közös `staging/imile-management-integration`,
a publikált `imile-qa` Firebase, a Rules és az üzleti
Google-táblák változatlanok.
