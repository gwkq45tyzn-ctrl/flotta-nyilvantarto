# iMile Flotta + Depó V1 – helyi, valós SDK protobuf-méretellenőrzés

## Mire való?

Ez az eljárás a **saját számítógépen lévő** teljes, négytömbös Flotta JSON-exportot ellenőrzi. A Google Firebase SDK rögzített verziójának helyi `writeBatch.set()` kódolásából és a Firestore v1 Document protobuf sémából kiszámítja:

- a **teljes, gazdag forrásarchívum** várható kódolt dokumentumméretét (`flottaSharedState/current`; változatlan négy eredeti tömb + elkülönített helyi import-metaadatok);
- **minden egyes** tervezett kulcsolt futár-/jármű-master és az ezekhez tartozó identitás-claim dokumentum tényleges helyi SDK/protobuf-méretét;
- a futár, jármű, tankolókártya és kapcsolat darabszámait és a kapacitásadatok helyi alkalmasságát.

A teszt **nem csatlakozik** a Firebase/Google/Apps Script rendszerhez, nem ír adatot, nem kér jogosultságot, nem használ fizetős szolgáltatást. Sem a futárok neve, azonosítója, rendszáma, elérhetősége, sem a privát elérési út nem kerül a kimenetre. A kapott SHA csak **helyben számított, nem hitelesített** forrásazonosító.

## Futtatás saját gépen

A repó egy helyi másolatában a rögzített, ingyenes tesztfüggőségekkel:

```bash
npm ci --prefix staging/imile-management/fleet --ignore-scripts --no-audit --no-fund
node staging/imile-management/fleet/v1-private-proto-preflight.mjs --input "/saját/privát/flotta-export.json" --json
```

Windows esetén az inputútvonal lehet például `"C:\\Privat\\flotta-export.json"`.

Kilépési állapot: **0** = helyi SDK-méretmérés sikeres; **1** = fájl/parancssori hiba; **2** = forrás-, mezőalak- vagy kódolási ellenőrzés hibás. A sikeres 0 **nem** jelent éles importengedélyt, külső hitelességet vagy megoldott Rules-limitet. A lehetséges okok statikus kódok, nem szabad nyers hibaüzenetet vagy privát adatot a GitHubra továbbítani.

## Bizonyossági szintek

| Jelzés | Mit igazol? |
| --- | --- |
| `localSdkProtoEncodedSizeVerified:true` | A helyi, rögzített SDK és protobuf-encoder a teljes source+összes projektált master/claim dokumentumot mérte. |
| `operationallyReady:false` | Lehet hiányzó aktív futárkapacitás, aktív jármű vagy a 25-ös futár Rules-korlát; a méretmérés ettől még adhat eredményt. |
| `productionFirestoreEncodedSizeVerified:false` | A tényleges éles projekt, beállítások és importált objektumok nincsenek hitelesen igazolva. |
| `productionSourceAttested:false` | A helyi exporthoz még nincs külön, jogosult személy által hitelesített aktuális mentés és SHA-pin. |
| `authorizedForImport:false` | Mindig hamis: nincs sem éles import, sem kiadási jogosultság. |

## Kötelező élesítési STOP

A helyi mérés nem tudja hitelesíteni a valós Firebase IAM-et/privilegizált importert, a megváltoztathatatlan trust-rootot, a régi Apps Script telepítések és triggerek leállítását, a teljes forrás négy tömbjének tulajdonosi mentését vagy az éles, privát adatokat. A nagyobb migráció az elérhető 120 dokumentumos egytranzakciós ellenőrzési határ felett továbbra is **fail-closed**. A 25 futár feletti Rules-korlát önmagában szintén blokkol.

Élesítéshez változatlanul szükséges a **Grok külön független GO-ja + ChatGPT külön független GO-ja ugyanazon SHA-n + a tulajdonos kifejezett engedélye**, a #83 szerinti ellenőrzésekkel. Nem kell és nem szabad a privát JSON-exportot GitHubra feltölteni. OFD, In-Hub, Excel és Attendance továbbra is szünetel.
