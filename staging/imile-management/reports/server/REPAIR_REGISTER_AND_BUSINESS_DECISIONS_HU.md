# PR #15 – javítási jegyzék és üzleti döntések

Alap: 804e196dfc1a30dfa0f54280debae6335be5c859. Az eredeti XLSX-ek kizárólag helyben, olvasással vizsgálva. A sorszámok az OOXML row/@r szerinti fizikai Excel-sorszámok, a fejléc az 1. sor. A fájlverziók SHA256 lenyomata a privát helyi jegyzőkönyvben található, nyers forrás nincs a repositoryban.

## Javítási jegyzék

| Fájl | Lap | Excel-sor | Hibakategória | Állapot |
|---|---|---:|---|---|
| In-Hub Inventory (6).xlsx | sheet1 | 2 | Budapest város + nem budapesti, négyjegyű irányítószám | Adatgazdai igazolás szükséges |
| In-Hub Inventory (6).xlsx | sheet1 | 308 | Ugyanaz | Adatgazdai igazolás szükséges |
| In-Hub Inventory (8).xlsx | sheet1 | 78 | Ugyanaz | Adatgazdai igazolás szükséges |
| In-Hub Inventory (8).xlsx | sheet1 | 89 | Ugyanaz | Adatgazdai igazolás szükséges |
| In-Hub Inventory (8).xlsx | sheet1 | 90 | Ugyanaz | Adatgazdai igazolás szükséges |
| In-Hub Inventory (9).xlsx | sheet1 | 16 | Ugyanaz | Adatgazdai igazolás szükséges |
| In-Hub Inventory (9).xlsx | sheet1 | 17 | Ugyanaz | Adatgazdai igazolás szükséges |

Mind a hét sor hibakódja invalid_budapest_postcode. Nem üres, nem rossz hosszúságú mezőről van szó: a város és az irányítószám ellentmond egymásnak. Nem állítható, hogy feltétlenül az irányítószám hibás; a város is lehet rossz. A helyes város/irányítószám párt a forrás adatgazdája igazolja a belső, jogosult rendszerben. Nincs nyers waybill, cím, név vagy az eredeti irányítószám a jegyzékben.

## Végrehajtható javítási folyamat

1. A depóvezető/adatgazda a helyi fájlnév + verzióhash + lap + fizikai sor alapján megtalálja a rekordot. Más fájlverzióhoz e sorszámok nem használhatók automatikusan.
2. Belső, engedélyezett forrásból igazolja a település és irányítószám párját. Nem itt és nem GitHubon oszt meg címet vagy csomagazonosítót. Mind a 7 tételhez kell adatgazdai döntés.
3. A javítást az illetékes a forrásrendszerben végzi el; az eredeti export változatlan bizonyítékként megmarad. A fejlesztő nem talál ki kerületet, nem javít tömegesen és nem dob el hibás sort.
4. Új, teljes export készüljön új fájlnévvel/verzióhash-sel. Az adatgazda jelzi a javítások lezárását személyesadat-mentes státuszlistán.
5. Ugyanazon jóváhagyott nap/depó-kiválasztással az egész exportot újraellenőrizzük, a más depók hibáit is. A régi fájlt/sorlistát nem minősítjük át késznek.
6. A preflight ready csak technikai tisztaság; nem bizonyít szolgáltatói eredetet, teljes napi állományt vagy üzletileg végleges riportot. Import/élesítés külön kapu marad.

## Üzleti döntési lista

| Azonosító | Adatgazdától szükséges döntés/bizonyíték | Addig érvényes korlát |
|---|---|---|
| D01 Delivered / History Delivered | Pontos számlálójelentés, naphoz rendelés, kumulált/korábbi kézbesítés, utólagos frissítés; egy csomag két mezőben megjelenhet-e? Az exportgazda adjon személyesadat-mentes kontrollösszeget ugyanarra a napra. | A kód Delivered-et használ; History Delivered-del nem adjuk össze és nem helyettesítjük. Ez nem üzleti jóváhagyás. |
| D02 Ismételt DA-sor | Azonos nap/depó/DA/vendor sorok diszjunkt részhalmazok vagy felülíró pillanatképek? Kell-e exportidő/batchkulcs? Ki dönt eltérő vállalkozó/név esetén? | A jelenlegi összeadás csak technikai működés. Üzemi alkalmazása nem engedélyezett megerősítés nélkül; eltérő vendor-kapcsolat blokkolt. |
| D03 10 órás állapot | A 10:00 körüli riport vágási ideje, frissíthetősége, véglegesítés időpontja és felelőse. | Előzetes, nem napi végleges KPI; az óra önmagában nem final engedély. |
| D04 Nap/időzóna | Forrásidő helyi vagy UTC, Europe/Budapest használata, éjféli és óraátállítási határ, késői események és raktárpillanatkép napja. | Nem konvertálunk találgatva. A legutolsó receive nap nem bizonyított üzleti riportnap. |
| D05 Többdepós export | Kötelező nap+depó választás, teljes vagy részleges állomány, kizárt sorok egyeztetése, hibás más depó kezelése, teljes napi kontrollösszeg. | Explicit exact kiválasztás; a teljes mátrix validálása kötelező; idegen depó hibája is blokkol. |
| D06 Futár/depoazonosítók | Stabil DA Code, vezető nullák, kis/nagybetű és whitespace, névváltozás, áthelyezés, vendorváltás, depókód-aliasok és hiányzó kód kezelése. | Szöveges azonosítók, nincs numerikus átírás/alias-kitalálás. Hiányzó vagy szóközösen kétértelmű depó blokkol, nem tűnhet el a scope-szűrésben. |

Minden döntéshez felelős szerepkör, verziózott állásfoglalás, érvényességi idő és személyesadat-mentes elfogadási eset szükséges. A fejlesztő az üzleti szabályt implementálja, nem maga hagyja jóvá.

## Technikai javítások és reprodukció

- #15 alapteszt: 22 eset sikeres. Új hiba reprodukálva: szóközös OFD üres sor numeric type hibát adott; most a core-ral azonos ürességfogalmat használjuk.
- A korábbi XLSX result.map nem töltötte ki a fájlból fizikailag kihagyott sorhelyeket. completePhysicalExcelRows Array.from használatával minden kihagyott hely üres tömb, az Excel-sor index+1 marad. A hiányzó fejléc nem keletkezik automatikusan, ismételt row/@r elutasított.
- In-Hub hiányzó depójú sora korábban egyszerűen scope-on kívül maradhatott. Most invalid_source_station és fizikai sorszám jelzi, teljes fájl blokkolva.
- Érvénytelen, de nem üres receive időbélyeg invalid_lm_receive_datetime diagnózist kap.
- 18 új regresszió: üres tömb/null/üres string/szóközös sor, hiányzó OOXML-sor, In-Hub/OFD sorszám, hiányzó depó, rossz dátum, 100-as hibakorlát és személyesadat-mentes kimenet.
- Az új modul bekerül a webcsomagba, az API és a release gate továbbra sem kapcsolódik felhőhöz. Nincs deploy vagy adatírás.

Következő tényleges feladat: D01–D06 adatgazdai döntéseinek rögzítése és a hét rekord belső forrásjavítása után egy új export helyi, teljes, csak olvasó ellenőrzése és kontrollösszeg-egyeztetése. Addig szintetikus QA és a külön PR ellenőrzése folytatható; a meglévő három fájl továbbra is blokkolt.
