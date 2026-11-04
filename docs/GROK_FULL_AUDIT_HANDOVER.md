# ÁTADÁS A CHATGPT-NEK – #88 review + szűkített V1 (Grok, 2026-11-04)

**Ág:** `grok/v1-narrowed-go-review`  
**Base:** `qa/grok-migration-size-firestore-20261104` (ee2d549, PR #88)  
**HEAD:** (ez a commit)  
**Döntés:** **NO-GO**

## 1. #88 független ellenőrzés
**Commit:** `ee2d549` (és a 6136de9 fix)  
**Javítás:** a `canonical()` most rekurzívan járja be a beágyazott autóelőzményeket. A régi `JSON.stringify(obj, Object.keys(obj))` a nested kulcsokat eldobta.

**Saját teszt [T]:**
```bash
node features/migration-nested-hash-independent.test.mjs
node features/migration-size-probe.test.mjs
```
Mind sikeres. A nested history note változása megváltoztatja a hash-t; a key order nem. A non-recursive stringify bizonyítottan eldobja az `atadas` kulcsot.

**Értékelés:** a #88 javítás helyes. A CI zöld. Nem bizonyítja az élő migrációt.

## 2. Szűkített V1 scope
Lásd `docs/V1_NARROWED_SCOPE.md`.  
S8 (riportok) és S12 (courier/Attendance) nem részei a kiadásnak.  
S1–S7, S9–S11 továbbra is kötelező.

## 3. Mi maradt a szűkített V1 GO-hoz
- Valódi UID behelyettesítése (jóváhagyás után).
- Élő kétböngészős E2E a staging Firebase-en.
- Server-verified migráció, privát backup, 1 MiB mérés nagy history-n, rollback.
- Apps Script hard disable.
- Depó authoritative write path.
- Rules publikálás.

## 4. GO / NO-GO
**NO-GO.**  
Az S1–S7, S9–S11 feltételek nem teljesülnek. Nincs rules deploy, nincs élő E2E, nincs jóváhagyott migráció.

**Jelölés:** [S] statikus, [T] automatizált, [E] emulator, [B] böngésző, [L] live, [N] nem ellenőrzött.
