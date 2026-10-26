# iMile Flotta v18.1 — telepítési jelölt

**Állapot 2026-10-26:** a forrás és 21 helyi automatizált ellenőrzés elkészült. Google Apps Scriptbe még nincs telepítve; valódi Google-környezetben végzett teszt nincs. A meglévő `main` és az éles adatok változatlanok. Ez a könyvtár nem teszi biztonságossá a továbbra is működő régi végpontokat.

## Tartalom

- `apps-script/Index.html`: a meglévő magyar–angol felület, bejelentkezéssel, felhasználókezeléssel, saját jelszó módosításával, mentési ütközés kezelésével. Nem tartalmaz flottaadatot vagy bekötött éles címet.
- `apps-script/Code.gs`: privát, **önálló** Apps Script-projekt szervere. Nem a jelenleg nyilvánosan szerkeszthető táblázathoz kötött projektbe telepítendő.
- `apps-script/Bcrypt.gs`: bcryptjs 2.4.3; az eredeti licenc megmaradt. Az egyetlen futtatókörnyezeti módosítás: a nem támogatott aszinkron időzítő ág kifejezett hibát dob. Csak a szinkron API használatos; az Apps Scriptben nincs `setTimeout`.
- `apps-script/appsscript.json`: V8, Europe/Budapest, Advanced Sheets v4, a szükséges spreadsheet és userinfo.email scope-ok.
- `tests`: szintetikus adatokkal futó Node tesztek. Nincs valódi felhasználói jelszó vagy flottaadat.

## Elkészült védelem

A böngésző `google.script.run` hívásokat használ. A munkamenet-azonosító nem kerül URL-be. Minden adat- és adminművelet a szerveren ellenőrzi a munkamenetet és a szerepkört. A kiszolgálón a segédfüggvények neve aláhúzásra végződik. Az első admin létrehozása csak a projekt tulajdonosának Google-munkamenetéből engedett.

A jelszó HMAC előfeldolgozás után bcrypt cost 12 hashként tárolódik a privát projekt tulajdonságaiban. A salt felhasználónként egyedi; a pepper nincs a táblában vagy a repóban. Hat hibás kísérlet 15 perces korlátozást eredményez. A munkamenet legfeljebb négy órás; a kijelentkezés visszavonja. Jelszóváltás vagy letiltás érvényteleníti a felhasználó régi munkameneteit, és az újraengedélyezés sem éleszti fel azokat. A Google cache korábbi kiléptetést is okozhat.

A közös JSON-állapot és a megjelenítési lapok egy Sheets batchUpdate művelettel íródnak. Verzióütközés nem ír felül adatot. Megismételt mentési kérés nem készít újabb módosítást. A kártyák D oszlopa átrendezés és kártyaszám-módosítás után is megmarad; a PIN-adatok nem kerülnek a klienshez. A szövegek nem Sheets-képletként íródnak. A táblák, riportok, előzmények és listák szöveges adatai HTML-escape-et kapnak.

A nem igazolt mentés piszkozata a böngészőfül sessionStorage-jában marad, új belépés után ugyanahhoz a felhasználóhoz visszatölthető. Ütközésnél a felület exportot és a közös adatok újratöltését kínálja. Ha a böngésző tiltja a piszkozat tárolását, a felület jelzi, hogy a fület a sikeres mentésig nyitva kell tartani.

## Ellenőrzések

A repó gyökerében:

```sh
node --test secure-v18/tests/*.test.cjs
```

13 szerverteszt és 8 felületteszt sikeres. Lefedik az első admin védelmét, a névtelen hozzáférés tiltását, a titkok szűrését, szerepköröket, hibás belépés korlátozását, kijelentkezést, letiltást/újraengedélyezést, jelszóváltást, lejáratot, verzióütközést, ismételt kérést, hibás írás visszatartását, a védett oszlopot és az ismeretlen meglévő mezőket, HTML-befecskendezést, HU/EN váltást, piszkozat-visszaállítást és hibás import elutasítását.

Ezek Apps Script-szolgáltatásokat és DOM-ot helyettesítő helyi tesztek. Nem helyettesítik a valódi Google-jogosultság, OAuth, megjelenés, több böngészőfül, Advanced Sheets és telepítési sebesség tesztjét.

## Következő telepítési lépések

1. A megszakadt Google-böngészős ellenőrzés befejezése. Meglévő Apps Script-állapot újbóli ellenőrzése; új projektet csak akkor létrehozni, ha a korábbi munka nem hozott már létre ilyet.
2. Privát önálló Apps Script-projekt létrehozása és a négy forrásfájl automatikus feltöltése. A felhasználónak nem kell kódot másolnia. A manifest és az Advanced Sheets szolgáltatás ellenőrzése.
3. `FLOTTA_SHEET_ID` beállítása a már meglévő privát teszttáblára; `BOOTSTRAP_USERNAME` megadása. `BOOTSTRAP_PASSWORD` értékét a tulajdonos saját maga adja meg a Google-felületen. Jelszó nem kerül chatbe, repóba vagy naplóba.
4. `initializeAdmin` futtatása a tulajdonosként, szükséges Google-jóváhagyás után. Ellenőrizni kell a jelszó hash-ét és a bootstrap jelszó eltávolítását, a hash vagy jelszó kiírása nélkül.
5. Teszt-webalkalmazás telepítése, futtatás tulajdonosként. Az alkalmazás bejelentkezési oldala elérhető lehet Google-belépés nélkül; minden flottaművelethez az alkalmazás saját munkamenete kell. A Google-projekt és a teszttábla maradjon privát.
6. Valódi teszt: névtelen olvasás/írás tiltása; admin és szerkesztő; két külön munkamenet; mentés/visszaolvasás; verzióütközés; kijelentkezés; letiltás; jelszóváltás; HU/EN; mobil és asztali megjelenés. Csak a tesztpéldányon, visszavonható szintetikus módosításokkal. Ellenőrizni kell, hogy az eredeti rekordok, a fejléc, a D oszlop, a formázás és a többi oszlop nem sérült.
7. Élesítés előtt friss összehasonlítás/mentés szükséges, ha közben az éles tábla módosult. A privát szervert az éles táblára kell átállítani; a meglévő `_APP_STATE`-ot nem szabad újrainicializálni. Eltérő Apps Script-projektek zárolása nem közös, ezért az átálláskor a régi és az új írás párhuzamosságát ki kell zárni.
8. Sikeres éles ellenőrzés után a GitHub `index.html` belépési hivatkozást/átirányítást kap, beágyazott flottarekordok nélkül. Csak ezután szüntethető meg a régi webalkalmazás nyilvános telepítése, a táblázat `anyone` jogosultsága és minden korábbi közzétett adatforrás. A régi HTML-fájlok és Git-előzmények beágyazott rekordjainak nyilvánosságát is kezelni kell; pusztán az `index.html` cseréje nem vonja vissza az előzményeket. Adatmegőrző megoldásként a régi repó priváttá tétele vizsgálandó.
9. A lezárás után ismét ellenőrizni kell a régi címek hozzáférhetetlenségét és az új rendszer működését. Sikertelen ellenőrzés esetén nem állítható, hogy az élesítés vagy a hozzáférések lezárása kész.

## Korlátok és visszaállítás

A kanonikus JSON jelenleg egy cellában van; 44 000 karakter fölött a kód elutasítja a mentést, adatcsonkolás nélkül. A kapacitás bővítése későbbi adatbázis-migrációt igényel. Az Apps Script kvótái és a bcrypt valós Google-futtatási ideje még mérendő. Az alkalmazáson kívüli közvetlen táblaszerkesztés nem kapja meg az alkalmazás zárolását; az éles használat a védett alkalmazáson keresztül történjen.

Az eredeti privát biztonsági másolatot és az eredeti telepítés adatait meg kell őrizni. Visszaállítás nem írhatja felül az időközben keletkezett új adatokat; előbb mindkét állapot mentése és összevetése szükséges. Sikeres lezárás után a nyilvános, hitelesítés nélküli régi rendszer visszakapcsolása nem elfogadható automatikus hibakezelés.

Hivatalos technikai háttér: [Apps Script kommunikáció](https://developers.google.com/apps-script/guides/html/communication), [Sheets kötegelt műveletek](https://developers.google.com/workspace/sheets/api/guides/batch?hl=en).
