# Csomagazonosítós előnézet és helyi QA

A DepóKapacitás Excel és adatok oldaláról minden aktív admin/editor/viewer megnyithatja a csak olvasható csomagelőnézetet. A kiválasztott fájl a böngészőben marad; az előnézet nem ír Firestore-ba és nem változtatja meg a napi igényadatokat. A JSON ellenőrzési jelentés helyben tölthető le.

## Ideiglenes formátum

CSV fejléc: `date,trackingId,district,kind`. JSON esetén e négy szöveges mezőt tartalmazó objektumok tömbje. A nap ISO `YYYY-MM-DD`, a besorolás `new` vagy `retry`. A tracking ID szöveg, kezdő nullái megmaradnak; összehasonlítás előtt szélső szóközeit eltávolítjuk és nagybetűsítjük. A kerület nagybetűs, a `/` karakter `-` lesz. E megfeleltetés prototípus, nem végleges valós forrásadapter.

Egy ID egy napon egyszer számít. Az azonos ismétlés figyelmeztetés és auditált kihagyás. Az eltérő kerület vagy new/retry besorolás az egész előnézetet blokkolja: nincs részösszeg vagy automatikus győztes. Másik érvényes nap kizárását külön jelzi az audit; hibás sor másik napon sem marad észrevétlen. Üres adat nem nulla igény. Legfeljebb 5000 sor és 2 millió karakter vizsgálható. Valós csomagadatot a QA-hoz ne használjunk.

## Reprodukálható tesztek

Node 24 és Java 21 mellett a tiszta checkoutban:

```sh
node depokapacitas/parcel-preview.test.mjs
node depokapacitas/source-health.test.mjs
npx --yes firebase-tools@15.34.2 emulators:exec --only auth,firestore --project demo-imile-qa --config firebase.depo-qa.json "node staging/imile-management/qa/run-depo-role-tests.mjs"
```

A szerepkörteszt kizárólag a 127.0.0.1 Auth/Firestore emulátorhoz kapcsolódik. Véletlen jelszavas szintetikus fiókokat ideiglenes helyi fájlban tárol, a fájlt kilépéskor eltávolítja; felhőbeli fiókot nem hoz létre. Admin/editor/viewer, anonim olvasás, kétféle duplafoglalás, atomikus foglalás és feloldás ellenőrzött.

Böngészős QA: a csomagoló után `prepare-depo-e2e.mjs <új-abszolút-könyvtár>` külön példányban kizárólag a Firebase konfigurációját és SDK-kapcsolódását irányítja a demo emulátorra. `serve-depo-e2e.mjs <könyvtár>` a jelölt példányt a 127.0.0.1:8123 címen szolgálja ki. A helyi példányt soha ne telepítsük! A `seed-depo-e2e.mjs <privát-helyi-fájl>` mesterséges 2099-02-01 igényt és foglalást készít. A hitelesítő fájl ne kerüljön repositoryba vagy kiszolgált könyvtárba. Az emulátor leállításával az adatok eldobhatók.

A mobilpróba 390×844 böngészőnézet, az asztali 1365×900; ez nem fizikai telefonon végzett ellenőrzés. Az adatforrás-jelzés szerveri visszaigazolást mér, nem a hiányzó valós forrásfájl keletkezési idejét. Gyorsítótár, függő írás, hiba, offline vagy 15 percnél régebbi visszaigazolás esetén a kapacitáskülönbség nem megbízható/zöld.

## Következő lépés

A valódi fejléc és a tracking ID kis-/nagybetű-azonosságának jóváhagyása után külön forrásadapter szükséges. Tényleges import előtt szerveroldali nap+tracking ID egyediség, auditált korrekció és tranzakciós mentés kell; a jelen előnézet önmagában nem akadályozza meg két külön fájl későbbi, külön mentését. A rendszám/km integráció és a forrástáblák e munkától függetlenül függőben maradnak.
