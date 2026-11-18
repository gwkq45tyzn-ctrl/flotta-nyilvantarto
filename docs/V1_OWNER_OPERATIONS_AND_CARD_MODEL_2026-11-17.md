# Owner operations review and separate card CRUD model

## Corrected P1: unresolved statuses cannot pass operational readiness

Previously an otherwise usable source with uncertain courier statuses returned
`ready:true` plus a warning. Capacity-only preparation could therefore look
complete while operational status decisions remained missing. Uncertain statuses
now also block readiness. The offline HTML still permits a private capacity-only
preview, preserving unknown statuses, but its summary explicitly reports
`operationallyReady:false` and no completed status review. No 70/80 default exists.

## Private owner decision process

1. Retain the original complete four-array backup and capture the source twice.
   Resolve pending/offline browser changes and active Apps Script writer mapping
   before a future live operation. Stable reads alone do not prove that freeze.
2. Prepare a PRIVATE decision object containing EXACTLY `sourceSha256`,
   `capacities`, `statuses`. `sourceSha256` is the canonical SHA-256 of the whole
   unchanged original JSON, including all unknown fields and nested history.
   Never put an actual plan, source hash or source data in GitHub/CI.
3. `statuses` contains one decision for EVERY uncertain source row, with exactly
   `id`, `daCode`, `status`, `reviewed`. The owner explicitly selects `aktiv` or
   `inaktiv` and sets `reviewed:true` only after checking the original business
   record. There are no automatic status selections. Existing known statuses
   cannot be changed through this narrow remediation path.
4. `capacities` contains one decision for EVERY resulting active courier,
   including newly activated couriers and previously valid capacities, with
   exactly `daCode`, integer `kapacitas` in 1..10000, `reviewed:true`. Missing
   capacities stay null/unreviewed in an initial private template. Inactive
   rows receive no capacity decision and retain existing data.
5. Locally call `prepareReviewedCourierOperations(original, plan)` from
   `tools/v1-capacity-remediation.mjs`. Its `candidate` is PRIVATE. It clones
   the entire source and changes only explicitly reviewed status/capacity
   fields, with stable row/DA matching. It refuses changed whole-source pins,
   missing/duplicate/foreign decisions, implicit capacity, invalid status,
   sealed/imported sources and failed admission bounds.
6. Save the candidate separately; reopen it, then run the EXISTING read-only
   five-file verifier, passing the object plan to `--decisions`:

   ```sh
   node tools/v1-private-capacity-transition.mjs \
     --first /private/first-A2-C2.json --second /private/second-A2-C2.json \
     --original /private/original-C2.json --candidate /private/reviewed.json \
     --decisions /private/owner-operations-decisions.json --json
   ```

   Exit 0 proves only a local reviewed transition with complete preserved rich
   content, stable captured bytes/token and operational checks. Schema v2 uses
   `locallyProvenReviewedTransition` and, for an object plan,
   `locallyProvenOnlyReviewedOperationsChanged`; it NEVER mislabels status
   changes as capacity-only changes. Any unreviewed field/history change denies.
7. The real owner confirms these exact private files through an independently
   authenticated channel. A JSON `reviewed:true` is NOT identity authentication.
   All owner-authentication, current live authority, pending-browser freeze,
   IAM, independent restore and import/release flags remain false. Generate a
   new independent backup and a new authenticated signed source after actual
   owner approval. Source/plan drift invalidates review; no live writer exists
   in these tools. Exact-version deployment permission remains a later decision.

Tests cover mixed active/inactive resolutions, explicit newly active capacity,
rich histories/cards/contacts/root preservation, stale source hash, source
readback drift, duplicate/foreign/unreviewed decisions and rich candidate tamper.
Private originals and decision inputs are never changed by the checker.

## Magyar offline űrlap mindkét döntéshez (2026-11-18)

A `tools/v1-owner-operations-review.html` a régi, csak kapacitásos űrlap
mellett külön, teljesen offline segéd (helyi `file://` megnyitás). A négy
tömbös, eredeti teljes JSON fájlt a böngésző lokálisan olvassa. Az
**összes bizonytalan státuszú** futárt külön aktiválni/inaktiválni és
ellenőrzöttnek jelölni kell; ha ez új aktív futárt eredményez, annak külön
**jóváhagyott kapacitás** is szükséges. Az **összes** eredményül aktív futár
kapacitását ellenőrizni kell, a már érvényes számokat is. A 70 csak javaslat,
nem tölthető be hallgatólagosan. A választás módosítása érvényteleníti a
korábbi ellenőrzést.

Az űrlap két PRIVÁT JSON-t készít:
- `imile-privat-tulajdonosi-dontesek.json`: pontos
  `{sourceSha256,capacities,statuses}` objektum, amelyet a létező
  `prepareReviewedCourierOperations` és
  `v1-private-capacity-transition.mjs --decisions` képes helyileg
  ellenőrizni; a `reviewed:true` NEM bizonyít valódi tulajdonosi azonosságot.
- `imile-privat-ellenorzott-flotta.json`: a teljes, eredetivel
  pontosan egyező rich adatokból és csak a megjelölt státusz-/kapacitás
  változásokból álló jelölt. Nincs közvetlen éles Firestore / Apps Script írás.

A felület a privát forrás és mindkét mentett fájl UTF-8-ját szigorú, `fatal:true` dekódolással olvassa: a böngésző `File.text()` lossy helyettesítő karakteres feldolgozása nem fogadható el hiteles rich forrásegyezésnek.

A két letöltött fájlt **külön-külön újra ki kell választani** az űrlapon:
az összesítő gomb csak bájtpontos, teljes JSON- és SHA-256-egyezés esetén
válik aktívvá. A redaktált összesítő nem tartalmaz nevet, DA-t, rendszámot,
telefonszámot, kártyaadatot vagy előzményt; a valódi forrás- és jelölt
SHA-256-ot kizárólag a privát helyi fájl tartalmazza. Az eredeti forrást,
jelöltet, döntési tervet, forráshash-t és mentést SOHA ne töltsd GitHubra/CI-ba.
A korábbi két A2:C2-pillanatkép, az eredeti C2 mentett bájtjai, a
független mentés és a tényleges owner hitelesítés külön kötelezők.

A teljesen szintetikus, 12 futáros / 14 autós, 6 hiányzó aktív
kapacitásos és 3 bizonytalan státuszú **valódi Chromium** QA teszt
ellenőrzi az explicit döntéseket, az újonnan aktivált futár külön
kapacitását, az eredeti teljes rich megőrzését, a visszaolvasásos
támper-denyt, a változtatás miatti visszavonást és a nulla HTTP-kérést.
Ez csak offline kezelhetőségi javítás, nem tulajdonosi jóváhagyás vagy
élesítési bizonyíték.

## Card archive and authenticated CRUD: reviewed design, NOT implemented parity

Keep imported `fuelCards` and their source attestations immutable. Do not restore
old local handlers or relax the archive Rules to make unsaveable edits appear
successful. The original view/full export remains available.

A future implementation needs a separate CURRENT card domain, with owner-approved
schema and authenticated migration from the private archive:

| Record | Required invariant |
| --- | --- |
| `flottaFuelCards/{stableCardId}` | Canonical current document; full preserved source payload, immutable provenance (source digest/index/stable ID), positive revision, lifecycle and assignment; no parallel mutable card array |
| `flottaFuelCardClaims/{normalizedBusinessKey}` | Unique claim created/changed atomically with canonical card; normalization/identity rules approved from actual field inventory, no arbitrary client provenance |
| `flottaFuelCardEvents/{eventId}` | Append-only change/tombstone evidence in the same transaction; actor UID from verified Auth, expected revision, before/after digests; never trust caller actor/time |
| Imported archive | Untouched forever; linkage and every unknown nested historical field retained; historical export must distinguish immutable source from current view |

Create needs an authenticated allowed principal, explicit complete fields, unique
claim and revision 1. Read must enforce the actual approved UID/role boundary.
Update needs exact expected revision, immutable source provenance/identity,
validated field allowlist and atomic audit event. Delete is a tombstone retaining
full source/history and claim policy; reactivation requires explicit owner policy.
No hard delete, status inference, overwrite merge, stale browser array save,
legacy queue replay or client-generated provenance. Assignment changes must
validate canonical courier/vehicle identities in the same transaction; no free
text mirror may become booking authority. Offline edits must show a conflict
until reread/review; they cannot silently overwrite current state.

Required before implementation: owner confirms allowed mutable business fields,
unique card key normalization, card replacement/reuse/assignment/tombstone policy,
actual authorized UID(s)/role model and complete original CRUD acceptance scope.
Do not publish actual card numbers/PINs or full records as examples. Test with
synthetic rich fixtures: create/read/update/tombstone positive; anonymous, other
UID, revoked identity, stale revision, duplicate claim, forged provenance/actor,
partial audit, concurrent assignment and old original-array writer negatives.
Two real browser contexts plus Auth/Firestore emulator must demonstrate conflicts
and exact original export/history parity. Separate Rules reviewed locally, with
no production publication in this task.

This document does not enable card CRUD or claim full original Fleet feature
parity. Actual IAM/UID and writer isolation remain unverified. Privileged Admin
writers can bypass Rules/audit documents: independent trust boundaries and writer
freeze still apply. Writable card parity remains an explicit S6 release blocker.
