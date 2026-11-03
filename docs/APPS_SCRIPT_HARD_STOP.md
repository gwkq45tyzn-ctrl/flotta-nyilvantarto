# Apps Script hard stop – cutover terv (V1)

**Állapot:** terv, nem végrehajtott.  
**Cél:** a régi Google Apps Script `pushRemote`/`pullRemote` ne írja felül a Firestore-t az éles cutover után.

## Lépések (csak jóváhagyás után)
1. Ellenőrizd, hogy a Firestore primary mód és a migration token aktív.
2. A híd már gated: Auth után a régi sync no-op.
3. Hard stop: a `index.html`-ben a `pushRemote`/`pullRemote` függvények törzse legyen üres return, vagy a script URL legyen eltávolítva.
4. Teszt: két böngészőben mentés után az Apps Script endpoint nem kap hívást.
5. Rollback: a régi függvények visszaállíthatók a JSON backupból, ha a Firestore cutover sikertelen.

## Jelenlegi állapot
- Gated (Auth után no-op) – megvan a hídban.
- Hard disable – nincs.
