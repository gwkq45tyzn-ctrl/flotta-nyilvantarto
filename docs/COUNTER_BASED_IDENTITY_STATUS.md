# Counter-Based Identity Status – 2026-11-10

**Status:** ISOLATED PROOF – not integrated into full restricted Rules.

## #140 results
- Isolated rules file `v1-counted-identity-induction.rules` demonstrates empty-base + single-row count delta can enforce uniqueness in a simplified schema.
- CI run #42778500465 was cancelled; staging integration #42778500264 succeeded.
- The proof is NOT the full `firestore-v1-restricted.rules`.
- A successful isolated test does not prove the five #133 attacks are denied on the real Rules.

## What remains
- Integrate the counter protocol into the full restricted Rules without breaking existing booking, migration, and original Flotta UI.
- Prove the five #133 attacks are denied on the full Rules with real emulator logs.
- Preserve original Flotta arrays, history, contacts, and fuelCards.
- Two-browser post-import UI chain.

## Structural alternative
One document per driver and one document per vehicle, with the document ID being the normalized identity. Uniqueness is a property of Firestore document IDs. Requires migration and changes the original Flotta array model, but preserves rich history in the document body.

## Current verdict
NO-GO. The counter approach is promising but not proven on the full Rules. The #133 attacks remain open on the current restricted Rules.
