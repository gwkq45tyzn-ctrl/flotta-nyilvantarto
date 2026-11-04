# Apps Script hard stop – bizonyítási terv (V1)

**Állapot:** terv + dry-run. Nem végrehajtott éles cutover.

## Jelenlegi állapot (3c47764)
- A híd `gateOldSync()` az Auth után a `pushRemote`/`pullRemote` függvényeket no-op-ra cseréli.
- Az eredeti Flotta HTML browser teszt (run 41767850892) igazolta: pre-import read-only, nincs Apps Script hívás.
- Hard disable (a függvények törzsének végleges eltávolítása vagy a script URL kivétele) nincs.

## Dry-run bizonyítás (éles cutover előtt)
1. Két böngészőben mentés után a hálózati naplóban nincs hívás az Apps Script endpoint felé.
2. A híd `status` üzenete: "Régi Apps Script írás letiltva".
3. A Firestore `flottaSharedState/current` revízió növekszik, az Apps Script tábla nem.
4. Rollback: a régi függvények a privát JSON backupból visszaállíthatók.

## Hard stop lépés (csak jóváhagyás után)
- A `index.html`-ben a `pushRemote`/`pullRemote` törzse legyen üres return, vagy a script URL legyen eltávolítva.
- Újra futtatni a kétböngészős tesztet.
