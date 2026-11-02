# App Check és híváskorlát – tényleges QA

2026-11-02; PR #60 pontos állapotára épül. Szintetikus helyi demo, felhős írás nélkül.

## Helyi eredmény

- 38/38 célzott Node teszt: 15 App Check, 5 limiter, 4 preflight,
  11 meglévő client permit, 3 meglévő Storage/PWA integrációs szerződés.
- 20/20 új valódi Auth/Functions/Firestore/Storage emulátoros próba:
  hiányzó/hibás/aláíráshibás/rossz app/rossz projekt/lejárt/jövőbeli igazolás,
  Auth hiánya, valódi Web SDK fejléc, idempotens retry, hiányzó policy,
  párhuzamos UID limit, több fiók közös DA limitje, új request ID megkerülés,
  live access/driver/disabled Auth/revoked token tiltás, kontrolladatok Rules-tiltása.
- 8/8 kézi valódi böngészős ellenőrzési csoport:
  1. Szintetikus futár- és adminbelépés.
  2. Mobil 390×844, vízszintes túlcsordulás nélkül.
  3. Negyedik kép előtt megszakított feltöltés; három eredeti objektum, még nincs receipt.
  4. Ugyanazon átvétel folytatása, hét hiteles eredeti kép; UID és DA napi used=1.
  5. Hét visszaadási kép, 200→225 km, kulcsleadás; awaiting_review zár.
  6. Admin fotómegtekintőben 14 generáció/hash ellenőrzött kép.
  7. Autó/kulcs/tisztaság után egyedi visszavétel: reviewed, mindhárom zár törölve,
     Flotta mileage=225, futár bejelentett és visszaigazolt km=25.
  8. A production App Check modult használó, üres site key-s kliens zártan tilt:
     „Az alkalmazáshitelesítés még nincs jóváhagyva és beállítva.”
     Nincs backend grant: UID extra=0 maradt. Mobilon is látható tiltás.

Helyi web: 127.0.0.1:8162; kizárólag a demo emulátorokat használó külső
QA importmap. Nem telepített staging URL, nem tartós pilot.
Egy új szintetikus futár/DA/autó és 14 kép maradt a helyi emulátorban, egy
reviewed sessionnel. Valós rekord nem érintett. A korábbi szintetikus checkpoint
megmaradt; annak teljes sikeres folyamatait helyben nem ismételtük.

A teljes CI-ben a korábbi 60+18 kvóta- és az eredeti verifier/Rules/Depó tesztek
az új attesztációs határ miatt regresszióként futnak. A CI végső SHA-ja és
eredménye a Draft PR-ben szerepel; ez a helyi jegyzőkönyv nem állít előre CI-sikert.

## Csak olvasó felhős bizonyíték

A `cloud-preflight-20261102.json` redaktált, időbélyeges 33 HTTP-megfigyelést tartalmaz.

- Projekt imile-management-staging; Firestore europe-west3.
- billingEnabled=false; a teljes bucketlista üres.
- Verifier/quota runtime szolgáltatásfiók lekérés: HTTP404.
- Functions-lista HTTP403 / UNKNOWN, nem „nincs Function”.
- Cloud Functions/Run/Eventarc/Build/Artifact Registry/Firebase Storage/
  App Check/reCAPTCHA Enterprise API DISABLED.
- Telepített Firestore Rules hash megmaradt; PWA-felhős szabálytelepítés nem történt.
- A tényleges Eventarc identitás és effektív erőforrás-/örökölt IAM nem bizonyított.
- App Check provider regisztráció/valós token és telepített callable enforcement
  nem bizonyított; a helyi szintetikus aláírás ezt nem helyettesíti.

Felhős állapot: **NO-GO**. A részletes engedélyezési és STOP kapukat az
`APPCHECK_PILOT.hu.md` tartalmazza. Nincs Blaze, IAM, cloud deploy, valós
adatírás vagy Google-forrás olvasás. A main és közös staging ág nincs módosítva.
