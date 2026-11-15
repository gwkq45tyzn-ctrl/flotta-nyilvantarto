# Apps Script – régi adatírók privát leltárának helyi ellenőrzése

**Állapot: NO-GO – kizárólag olvasási segédeszköz.** Ez nem igazolja az éles telepítések és triggerek valódi állapotát, nem csatlakozik a Google-fiókhoz, és semmit sem állít le vagy módosít.

A jogosult tulajdonos a Google-fiókban **csak olvasással** ellenőrizze a tényleges script-projekteket, telepített webapp-verziókat, időzített és telepített triggereket, futtatási identitásokat, érintett Sheet/Firebase-célokat és régi böngészőket. Valódi azonosítót, URL-t, nevet, kulcsot vagy ügyféladatot NE tegyen a GitHubba és NE küldjön chatben. Privát leltárból készítsen helyi, anonimizált JSON-t.

## MacBookon, a klónozott repositoryból

    node tools/v1-apps-script-cutover-cli.mjs --input "/privat/hely/anonimizalt-leltar.json"

Géppel feldolgozható, személyesadat-mentes összesítés:

    node tools/v1-apps-script-cutover-cli.mjs --input "/privat/hely/anonimizalt-leltar.json" --json

Kilépési kódok: 0 = helyi, önbevallásos leltár szerkezetileg teljes és nem szerepel benne aktív, Flottát író folyamat; 2 = hiány/UNKNOWN/aktív író; 1 = hibás bemeneti fájl. A 0 **NEM jelent élesítési jóváhagyást**.

## Fiktív JSON példa (NEM éles bizonyíték)

~~~json
{
  "schemaVersion": "imile-v1-local-legacy-cutover-1",
  "capturedAt": "2026-11-15T15:00:00.000Z",
  "ownerDeclaredComplete": true,
  "coverage": {
    "scriptProjects": true,
    "deployedWebApps": true,
    "staleBrowserClients": true,
    "installedTriggers": true,
    "timeDrivenTriggers": true,
    "sheetDestinations": true,
    "firebaseDestinations": true,
    "urlFetchWriters": true
  },
  "sourceSha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "principals": [{"ref":"principal-sample-1","identityReviewed":true}],
  "destinations": [{"ref":"destination-sample-1","kind":"sheet","writeTargetReviewed":true}],
  "projects": [{
    "ref":"project-sample-1",
    "ownerPrincipalRef":"principal-sample-1",
    "deployments":[{
      "ref":"deployment-sample-1",
      "enabled":false,
      "mayWriteFleet":true,
      "principalRef":"principal-sample-1",
      "destinationRefs":["destination-sample-1"],
      "versionReviewed":true
    }],
    "triggers":[{
      "ref":"trigger-sample-1",
      "kind":"time-driven",
      "enabled":false,
      "mayWriteFleet":true,
      "principalRef":"principal-sample-1",
      "destinationRefs":["destination-sample-1"]
    }],
    "declaredNoDeployments":false,
    "declaredNoTriggers":false
  }]
}
~~~

Ez a példa mesterséges adatokkal készült. A capturedAt mindig a tényleges ellenőrzés UTC ideje legyen, legfeljebb 7 nappal korábbi; a sourceSha256 önbevallás, nem aláírt külső bizonyíték. A coverage egyetlen mezője sem lehet igaz, amíg a tulajdonos azt ténylegesen nem nézte át. Üres deployment/trigger lista is csak külön ellenőrzött és kifejezetten bevallott üresség mellett fogadható el; az ismeretlen futtató fiók, cél, verzió, aktív adatíró vagy hiányzó kör mind blokkol.

A forráskódból ismert fő jelöltek: az eredeti Flotta pushRemote/pullRemote, a bridge gateOldSync és a külön syncAttendance script. A repository NEM bizonyítja, hogy ezek közül pontosan mely verziók futnak jelenleg. Háttér: docs/V1_APPS_SCRIPT_HARDSTOP_STEPS.md és docs/V1_APPS_SCRIPT_INVENTORY.md.

## A helyi PASS után is kötelező

Tulajdonosi hozzáféréssel igazolni kell a tényleges éles script- és trigger-leltárt, a régi írók biztonságos leállását, a mentést és forrás SHA-ját, a privilegizált Firebase-importer IAM-jét, a Firestore valódi kódolt méretét és a visszaállíthatóságot. A végső azonos SHA-jú független vizsgálatok és külön tulajdonosi engedély hiányában a teljes V1 továbbra is NO-GO. Tilos éles deploy, main merge, IAM/UID/secrets/valós adat módosítás. OFD/In-Hub/Excel/Attendance PWA fejlesztése elhalasztva.
