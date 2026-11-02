# Új kvótavédelem – helyi végső eredmények

Alap #59 `d8ae8239176c5df4f4b6e9438f7910d7f1c0395c`, nem új rendszer.
A #59 sikeres CI-jét ellenőriztük, változtatásait megőriztük.

31 célzott Node unit/forráskontraktus, 60 teljes kvóta/emulátoros forgatókönyv,
18 további jogosultság- és zárláncteszt: sikeres. A teljes új CI pontos commitját
és eredményét a draft PR Checks oldalán kell ellenőrizni; a régi CI nem bizonyíték
az új kódra. A meglévő teljes staging workflow és emulátoros regressziók megmaradtak.

## Új mobilos/asztali végponti ellenőrzések – valódi böngésző

Minden SDK csak loopback emulátorokra kötve, projekt `demo-imile-quota`.
Termék-konfiguráció nem módosult a helyi QA-adapter miatt. Semmi nem került cloudba.

1. `qa_mobile` szintetikus futár belépett, `SYN8002` autót választott, kezdő km 200.
   A futár nem látott adminisztrátori kvótaszerkesztést.
2. A 4. képfeltöltés mesterséges megszakítása: `SYNTHETIC_UPLOAD_INTERRUPTED`.
   UID/DA számláló 1/1, session és autózár még nincs; az engedély már ellenőrizhető.
3. TELJES lapújratöltés, eredeti 7 kép újbóli kiválasztása. A session ugyanaz
   (`s_b75445c8a57ecfc0be09587d9e83f55c`), a számláló továbbra is 1/1.
   A meglévő képek bájtpontos ellenőrzése után a verifier kiállította a receiptet,
   a Firestore-tranzakció használatba adta az autót. Ez nem fixture receipt.
4. Hét új visszaadási kép, 225 km és kulcsleadás: `awaiting_review`.
   Ugyanaz a session, a számláló 1/1 maradt. Reggeli fizikai autó/kulcs/tisztaság
   igazolás után a jármű szabaddá vált és a Fleet-kilométer 225 lett.
   A teljes szintetikus napi riport 50 bejelentett / 50 visszaigazolt km-t mutatott
   (a korábbi emulátoros 25 + az új böngészős 25 km).
5. Második új átvétel a tesztpolicy 1-es napi kerete mellett: a PWA magyar
   kvótakimerülési üzenetet mutatott. Nem jött létre új engedély vagy autózár.
6. Külön asztali admin munkamenetben az új űrlap indoklással +1 keretet adott.
   UID és DA oldalon is `extra:1`; a műveletnek szerveres auditbejegyzése lett.
7. Az eredeti futárlapon újrapróbálva új, szerveres session jött létre
   (`s_53d8a8fe9d2eb3d5367d6a5d402166eb`), `used:2, extra:1` mindkét számlálóban.
   A feltöltést a 4. képnél ismét megszakítottuk: autókiadás nem történt.
8. Az adminfelületen a függő engedélyt visszavontuk, ugyanazon azonosítót indokoltan
   újranyitottuk, majd QA végén újra visszavontuk. Mindhárom művelet auditált;
   a kvóta nem nőtt tovább és nem is térült vissza. Aktív autózár 0.

A böngészős normál 7+7 és újrapróbálás így az új szerveres engedélyezésen ment át.
Az admin tesztlap eltérő helyi portot használ, hogy egyszerre két külön Auth
munkamenetet lehessen ellenőrizni; a termék közös belépési működése nem változott.
Az általános, korábban sikeres 29 böngészős csoportot nem futtattuk újra.

## Visszamaradt szintetikus adatok és korlátok

Csak a helyi demo-emulátorban: tesztfiókok, futárok/autók, két reviewed session,
eredeti fotók/receipt-ek, kvóták/kérésnaplók és auditok. A függő böngészős
feltöltés három képe visszavont engedéllyel megmaradt. Nincs hozzá aktív session
vagy birtoklási zár. A korrupciós zárláncteszt explicit jelölt ideiglenes
sessionjét és saját zárait az azonosító ellenőrzése után töröltük; más adatot nem.

Köztes harness-probléma volt a régi worker/szabály gyorsítótárazása forrásváltás
után. A végső ellenőrzések frissen indított Functions workerrel és explicit
szabálybetöltéssel történtek. A letiltott célfiók biztonságos admin-visszavonását
külön javítottuk és negatív/pozitív emulátoros teszttel ellenőriztük.

Felhőben nincs tesztelve: quota callable, éles IAM/CORS/App Check/terhelés,
telepített szabályok és valódi mobilkamera. A pilot jóváhagyásai és a pontos
fennmaradó korlátok az `UPLOAD_QUOTA.hu.md` dokumentumban vannak.
