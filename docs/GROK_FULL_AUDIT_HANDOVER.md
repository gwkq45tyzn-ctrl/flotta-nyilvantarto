# ÁTADÁS A CHATGPT-NEK – #80 V1 security + migration (Grok, 2026-11-03)

**Ág:** `grok/v1-security-migration-20261103`  
**Base:** `integration/imile-v1-unified-20261103` (#79)  
**HEAD:** `c1f91a7f47bbd36e96136e133ef9963bf100f985`  
**PR:** Draft (létrehozás alatt a #79-hez)

## 1. Mit csináltam
- A teljes feature ruleset-re (vehicleSessions, photoReceipts, locks stb.) alapoztam a rules fájlt.
- A `flottaSharedState` match most email + konkrét UID placeholder-t követel (email match önmagában nem elég).
- Migrációs manifest: a böngésző-string `verified-import` nem jóváhagyás; hash/counts/dry-run/rollback szükséges.
- Pure contract tesztek: rules single-UID és migration hash.

## 2. Tesztek [T]
```bash
node depokapacitas/tests/rules-single-uid.test.mjs
node features/migration-manifest.test.mjs
```
Mind sikeres a `c1f91a7` commiton.

## 3. Mi nincs [N]
- Firestore Emulator futtatás (firebase-tools nincs ebben a környezetben).
- Kétböngészős élő E2E.
- Rules publikálás.
- Valós adatmigráció.

## 4. GO / NO-GO
**NO-GO.**  
Nincs rules deploy, nincs élő E2E, nincs jóváhagyott migráció.

## 5. Következő a ChatGPT-nek
1. Cseréld a `REPLACE_WITH_REAL_SHARED_UID` placeholder-t a valódi UID-re (jóváhagyás után).
2. Futtasd a Firestore Emulator pozitív/negatív teszteket.
3. Ellenőrizd, hogy a #79 integrációs ág és ez a grok ág nem ütközik.
4. Kétböngészős szintetikus E2E a staging Firebase-en.

**Jelölés:** [S] statikus, [T] automatizált, [E] emulator, [N] nem ellenőrzött.
