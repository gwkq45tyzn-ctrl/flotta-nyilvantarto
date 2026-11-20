# Flotta → Firestore migrációs és visszaállítási terv (V1)

**Állapot:** tervezet, nem végrehajtott. Csak szintetikus adatokkal tesztelhető.  
**Kötelező:** JSON export, ellenőrzés, explicit `flottaMarkImportVerified()`, majd első írás.

## 1. Előfeltételek
- Firebase Auth `imilemanagement@imile-management-staging.firebaseapp.com` létezik, users/{uid} active admin.
- Rules publikálva (csak jóváhagyás után).
- Nincs éles adatírás jóváhagyás nélkül.

## 2. Export
1. Nyisd meg az eredeti Flotta-t (még Apps Script vagy localStorage módban).
2. Használd a beépített „JSON biztonsági mentés” gombot, vagy hívd a `window.flottaExportShared()`-et.
3. Őrizd meg a fájlt privát helyen. Ne töltsd nyilvános GitHubra.

## 3. Ellenőrzés
- Nyisd meg a JSON-t.
- Ellenőrizd: vehicles, drivers, fuelCards, contacts, history mezők száma.
- Futtasd a `planSharedMigration` pure függvényt szintetikus másolaton (features/shared-master-adapter.mjs).

## 4. Első írás (csak jóváhagyás után)
- Jelöld ellenőrzöttnek: `flottaMarkImportVerified()`.
- Az első mentés a `flottaSharedState/current` dokumentumba kerül revision=1-gyel.
- Ellenőrizd a Console-ban a dokumentumot.

## 5. Visszaállítás
- Ha hiba: töröld vagy állítsd vissza a `flottaSharedState/current` dokumentumot a JSON-ból.
- A helyi localStorage és a JSON export a visszaállítási forrás.
- Ne futtass automatikus felülírást.

## 6. Korlátok
- Firestore dokumentum max 1 MiB. Nagy history esetén split vagy summary szükséges (még nem implementált).
- Nincs élő teszt ebben a dokumentumban.
