# ÁTADÁS A CHATGPT-NEK – Concurrent + login harden (Grok, 2026-11-03)

**Ág:** `grok/v1-concurrent-login-fix`  
**Base:** `integration/v1-security-restricted-20261103` (aefbe74)  
**HEAD:** `74e18b1`  
**Döntés:** **NO-GO**

## 1. Mit vizsgáltam
- ChatGPT `aefbe74` és a #84 PR.
- GitHub Actions run `41723239042` (two-browser emulator QA): **FAIL**.
- Diagnosztika a logból:
  ```
  CONCURRENT QA DIAGNOSTIC: {"serverRevision":3,"clients":[
    {"state":"connected-server","revision":"3","saveEnabled":true},
    {"state":"write-error: permission-denied","revision":"3","saveEnabled":true}
  ]}
  Error: concurrent transaction resolution failed, UI status=connected-server
  ```
- Korábbi run `41721515412` (régebbi SHA): concurrent PASS + original Fleet login PASS.

## 2. Mit javítottam
### Concurrent revision (megerősített hiba)
A `v1-browser-compat-test.html` `boundedConfirmedRetry` a `permission-denied`-ot csak akkor retry-zta, ha a szerverrevízió nagyobb volt, mint a kattintáskor látott UI-revízió. Ha a másik kliens írása már frissítette az UI-t, a feltétel hamis volt, és a második írás elveszett (revízió 3 maradt 4 helyett).

**Javítás:** a tranzakciót újraolvasás után retry-zzuk, amíg a próbálkozási keret tart. Csak akkor állunk meg, ha a szerver a helyi nézet mögött van egy próbálkozás után (valódi jogosultsági hiba).

### Login / verifyMember
A `verifyMember` most egyszer újrapróbálja a tranziens szerverolvasási hibát, és logolja az error code-ot. Hiányzó vagy inaktív profil továbbra is hard fail. Az eredeti Flotta login teszt a legutóbbi sikeres runban (41721515412) PASS volt; a későbbi runokban a concurrent lépés miatt nem futott le. A harden csökkenti a tranziens emulatoros false-fail esélyét.

## 3. Tesztek [T]
```bash
node staging/imile-management/fleet/concurrent-retry-decision.test.mjs
```
Sikeres a `74e18b1` commiton.

Az emulatoros kétböngészős és az eredeti Flotta HTML login teszt ebben a környezetben nem futtatható (nincs firebase-tools + Playwright). A ChatGPT CI-je fogja megerősíteni.

## 4. Mi maradt
- A javítás CI-ben való megerősítése (kétböngészős emulator QA + original Fleet login).
- Single-UID placeholder csere a valódi UID-re (jóváhagyás után).
- Élő kétböngészős E2E a staging Firebase-en.
- Server-verified migráció, privát backup, 1 MiB mérés, rollback.
- Apps Script hard stop.
- Attendance CI regresszió (#82) végleges javítása.

## 5. GO / NO-GO
**NO-GO.**  
Az S1–S12 feltételek nem teljesülnek. Nincs rules deploy, nincs élő E2E, nincs jóváhagyott migráció.

**Jelölés:** [S] statikus, [T] automatizált, [E] emulator, [B] böngésző, [L] live, [N] nem ellenőrzött.
