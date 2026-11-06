# Apps Script cutover – biztonsági bizonyítás és visszaállítás (V1)

**Állapot: TERV + HELYI, SZINTETIKUS EMULÁTOROS TESZT. Éles Apps Script leállítás és adatátállás NEM történt.**

## Mit bizonyít a korábbi CI?
- Az eredeti teljes Flotta HTML `pre-import` állapotban írásvédett; a vizsgált böngészős útvonalon nem hívta az Apps Script végpontot.
- A `gateOldSync()` kliensoldali `pushRemote` és `pullRemote` függvényeket no-op-ra cseréli a megfelelő inicializálási ágon.
- Ez **nem szerveroldali hard stop**, és nem zárja ki, hogy másik böngésző, régi kliens vagy régi Apps Script telepítés továbbra is írjon.

## Kötelező külön bizonyítás egy későbbi, jóváhagyott cutover előtt
1. Az eredeti Apps Script projekt forrását, verzióját, telepítési azonosítóját, jogosultságait és minden ismert endpointját **privát**, hozzáférés-korlátozott leltárban rögzítjük. Titkot/hozzáférést nem írunk GitHub issue-ba.
2. Az eredeti Flotta forrás és a releváns, aktuális Sheets állapotát privát, megnyitható, hash-ellenőrzött backupban rögzítjük; külön ki kell próbálni a visszaállítást. A JSON adatbackup **nem** Apps Script-kódmentés.
3. Szintetikus tesztekben szimuláljuk a régi kliens, új kliens és a kétböngészős összeütközések forgatókönyveit; hálózati naplóval bizonyítjuk az endpoint-tiltást.
4. A valódi, jóváhagyott staging környezetben, **engedély után**, külön igazoljuk a Firestore szerver által megerősített revízióját, a hozzáférés-visszavonást és azt, hogy nem történt Apps Script írás. Jelenlegi CI csak localhost emulatoron futott.
5. A tényleges letiltás terve kiterjed **minden régi telepítésre és kliensre**, nem csak a HTML egyetlen JavaScript-függvényére. A lépéshez szükséges jogosultságokat ellenőrizni kell; nem kerülhetők meg.

## A későbbi visszaállítás feltételei
- A tárolt, verziózott **alkalmazáskód + Apps Script forrás/telepítés + külön adatmentés** együtt szükséges.
- Legyen meghatározott visszaállítási sorrend és duplikált írás elleni védelmi ablak, mert a két adatbázis párhuzamos írása adatvesztést okozhat.
- Egyszerű `pushRemote`/`pullRemote` újraengedélyezés vagy egyetlen privát JSON fájl **nem elegendő** visszaállításnak.

## Engedélyezés
Éles Rules deploy, valódi UID, adatimport, Apps Script telepítés módosítása vagy teljes hard disable csak **a közös, azonos SHA-ra vonatkozó ChatGPT + Grok GO után, és a felhasználó külön élesítési engedélyével** megengedett. A jelenlegi eredmény **NO-GO**.

A fejlesztés ingyenes, jóváhagyást nem igénylő részeivel addig folytatni lehet a munkát.
