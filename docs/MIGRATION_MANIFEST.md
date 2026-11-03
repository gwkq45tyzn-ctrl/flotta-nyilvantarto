# Migrációs manifest és visszaállítási terv (V1)

**Állapot:** tervezet, nem végrehajtott. Csak szintetikus adatokkal tesztelhető.  
**Kötelező:** privát JSON export, hash/counts ellenőrzés, explicit jóváhagyás, dry-run, rollback terv.  
A böngésző-string `flotta_migration_token='verified-import'` **nem** migrációs bizonyíték.

## 1. Források
- Eredeti Flotta teljes JSON export (`vehicles`, `drivers`, `fuelCards`, `contacts`, history).
- Helyi `flotta_pending_v16` ha van.
- Apps Script szerverváltozat (ha elérhető, read-only).

## 2. Ellenőrzés (dry-run)
1. Számold meg a rekordokat és a history elemeket.
2. Számíts SHA-256 hash-t a normalizált JSON-ra.
3. Futtasd a `planSharedMigration` pure függvényt (features/shared-master-adapter.mjs).
4. Ellenőrizd a 1 MiB Firestore dokumentumlimit közelítését.
5. Dokumentáld a különbségeket gépek között.

## 3. Jóváhagyás
- Külön, nem böngésző-string alapú jóváhagyás szükséges (pl. admin megerősítés a users/{uid} dokumentumban vagy külső aláírás).
- Csak ezután lehet az első írás a `flottaSharedState/current` dokumentumba.

## 4. Első írás
- Revision = 1.
- Csak a szigorú rules által engedett mezők.
- A rich Flotta history a privát tervben marad, nem kerül a Depó /vehicles vagy /drivers dokumentumokba.

## 5. Visszaállítás
- A privát JSON export a visszaállítási forrás.
- A Firestore dokumentum törölhető vagy felülírható a backupból.
- Ne futtass automatikus felülírást.

## 6. Korlátok
- Nincs éles írás jóváhagyás nélkül.
- 1 MiB limit nagy history esetén split vagy summary szükséges (még nem implementált).
