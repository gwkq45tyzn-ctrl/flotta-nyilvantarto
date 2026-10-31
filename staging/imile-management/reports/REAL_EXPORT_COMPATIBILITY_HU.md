# PR #12 – nyers Excel-kompatibilitás (2026-10-31)

Alap: 485be8e3b2bce85c25bd7d4988e92eefcfe32d00. Külön fejlesztői ág; nincs telepítés, API-bekapcsolás vagy ruleset-módosítás.

## Helyben ellenőrzött források

Downloads: In-Hub Inventory.xlsx és (1)…(12).xlsx. Ebből (7) egy elkészült, háromlapos riportminta, nem közvetlen nyers export; harmadik lapja 29 oszlopos feldolgozott forrás, LM Receive és District mezővel. A 12 nyers export 26 oszlopos, azonos fejlécsorrendű.
Downloads: DA OFD Monitor.xlsx (214 adatsor), DA OFD Monitor (1).xlsx (14 adatsor), 35 pontos fejléc. Desktop: DA OFD Monitor - 2026-10-28T193928.013.xlsx: 14 oszlopos kész riport, kilenc összevont tartomány és 17 képlet. Nem azonos időpontú a nyers mintákkal, így numerikus azonosságot nem állítunk.
A korábbi automatikus QA iMile_*_kesz fájljait nem tekintettük üzleti referenciamintának.

In-Hub kulcsmezők: Waybill Number, Inventory Station, LM Receive Date, Consignee city, Consignee zipcode. Az azonosító és irányítószám szöveg, LM Receive Date szöveges YYYY-MM-DD HH:mm:ss. A vizsgált depók DS(AKE) és DS(IKA). A feldolgozás Budapestnél az irányítószám 2–3. jegyéből kerületet, máshol a település nevét használja.
OFD kulcsmezők: OFD Date, DA, DA Code, Vendor, OFD, Delivered, Station. Nap: YYYY-MM-DD szöveg. Az OFD és Delivered numerikus cella, Excel @ (49) formátummal. Azonosítók szövegek. A nagy export 25 depót, a kisebb DS(AKE) depót tartalmaz.

## Eredmény és javítás

A fejlécek megfelelnek a jelenlegi report-core követelményeinek. Nincs automatikus aliaskeresés vagy History Delivered helyettesítés.
Kilenc In-Hub export jelenleg ready; a (6), (8), (9) fájl összesen hét hibás budapesti irányítószám miatt továbbra is blocked. Ezek forráshibák: sorokat nem dobunk el és kerületet nem találunk ki.
Mindkét nyers OFD export helyben feldolgozható. A nagy, többdepós fájl eddig szándékosan elbukott az egyetlen nap/depó forrás-összevetési kapun. Az új rawScope:{date,station} kizárólag explicit és a candidate-tel pontosan egyező kiválasztás esetén engedi a teljes kiválasztott csoport összevetését. Alapértelmezett többdepós tiltás megmaradt. A teljes nyers mátrix összes sorát előbb validáljuk, másik depó hibás sora sem tűnhet el. A kimenet megadja a kiválasztott és kizárt sorok számát; nincs nyers ID-kimenet vagy adatmentés. A HTTP API-ba ezt nem kötöttük be, forrás- és adatkezelési jóváhagyás továbbra is szükséges.
A dátumfeldolgozó a korábbi csonkolás helyett pontos ISO-napot vagy érvényes HH:mm[:ss] időt fogad el. A hibás idő és tetszőleges utótag tiltott; numerikus Excel-dátumot, időzónát nem találgat. Numerikus waybill és DA Code nem alakul szöveggé, a kezdő nullák elvesztését nem rejtjük el. A meglévő Date objektum/HH:mm tesztkompatibilitás megmaradt.

## Személyes adat nélküli minták

fixtures/masked-export-matrices.json, MASKED_inhub.xlsx és MASKED_ofd.xlsx. Az összes 26/35 fejléc és a releváns cellatípus/formátum megmaradt, az értékek teljesen mesterségesek, nem visszafejthető álnevesítések. Nincs valódi csomagazonosító, név, cím, DA-kód, vállalkozó, dátum vagy állománysor; a tesztdepók DS(SYN_AKE)/DS(SYN_IKA). Az XLSX-ek újonnan készültek, nem másolják át a források megjegyzéseit, rejtett lapjait, kapcsolatait vagy metaadatait.
A fixtures személyesadat-mentes, a teljes eredeti export és annak privát helyi elemzési másolata nem kerül GitHubra.

## Független tesztelvárások

In-Hub: 4 csomag, 9/11/Dunaharaszti, két nap. OFD: 45/37, 3 futár, 2 depó; ugyanazon futár két sora 15/12, az első depó vállalkozói aránya 17/25, nem az egyedi százalékok átlaga. 18 új regressziós eset, explicit kiválasztás, részleges candidate és hibás idegen depós sor tiltása.
A kész minták szerkezete/színei referenciaként ellenőrzöttek, natív Excel-renderelést és a két eltérő napi riport darabszám-egyezését nem állítjuk.

## Még szükséges élesítési feltételek

Adatgazda hagyja jóvá a forrásfájlok teljes napi/részleges pillanatkép jellegét, többdepós szűrés napját és depóját, Delivered vs History Delivered jelentését, az ismételt DA-sorok összeadhatóságát, az ID kis/nagybetű-szemantikát és forráskeletkezési időt. Hibás budapesti irányítószámokat a forrásban kell javítani. A kész pivot nem lehet a nyers export helyettesítője.
Külön vállalati adatkezelési/üzemeltetési/költségjóváhagyás, független forrásátvétel, API/rules átállási terv, megfelelő hozzáférések és rollback szükséges. Az API URL és deployment gate letiltva marad. Main, éles Flotta, publikált Firebase-adatok és a Google-forrástáblák változatlanok.
