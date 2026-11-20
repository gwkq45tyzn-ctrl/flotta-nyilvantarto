# PR #6–#8 egyeztetés a #5 staging megoldással

Alap: 24fda60e6a52af0bc863c628f11b3a5714fe96c0.

- #6 (28a1d89b3ebbb25b4d9b3497dd76ca2935a8e195) e49-re épült. Az app.js, csomagoló és workflow közös részeit kézzel egyeztettük: a #5 source-health, cache/pending/error/stale tiltása, null sárga jelzése, mobil CSS és egyetlen csomagelőnézete megmaradt. A következő napi előrejelzés az áttekintés és beosztás oldalán csak hiteles forrásokból ad számokat; tervezett és megerősített kapacitást külön mutat. A kerületi hiányt depószintű többlet sem rejti el. A dátumtartomány végén tiltott előrejelzés; a beosztási űrlapot az időzített hitelességellenőrzés nem törli.
- #7 (257ef3d3d0d913c0040f32a419df50443029b6a9) #6-ra épült. Helyi fájlelőnézete, nap+ID deduplikációja és konfliktusjelzése átfed a #5-tel. Nem vettük át a második előnézeti felületet vagy az automatikus mezőaliasokat. A számmá alakított ID String konverziója elveszítheti a kezdő nullák bizonyíthatóságát; a #5 szöveges követelménye megmaradt. Valódi többlet a tárolt demands és a csomaglista összehasonlítása, valamint az Excel támogatása. Ezek NINCSENEK integrálva: a végleges mapping után az egyetlen meglévő előnézetbe illeszthetők. Konfliktusos csomaglista részösszege ekkor sem jelenhet meg hitelesként.
- #8 (99710a7f3b91ac3bb7bce0a202c311f69ff5edfe) a megfelelő #5 alapra épült. A tiszta adapter, 31 teszteset és az importkapu-dokumentum átvéve. A CI-fájlt egyesítettük, nem felülírtuk. Nincs SDK, adatbázisírás, automatikus UI-bekötés vagy default valós mapping. importAllowed:false mindig. A modult a nyilvános webcsomagba nem tettük be.

A PR-eket nem olvasztottuk main-be és nem zártuk le. Attendance, VEHICLE_Fuel_Database, Firebase Rules és éles Flotta változatlan. A következő napi igény továbbra is aggregált mennyiség, nem csomagszintű egyediségbizonyíték.

Következő konkrét feladat: forrásgazda által jóváhagyott fejlécek és tracking ID szemantika után a #7 összehasonlítását a meglévő előnézethez kapcsolni az explicit #8 adapterrel; tényleges import előtt külön szerveroldali egyediség/tranzakció/audit szükséges.
