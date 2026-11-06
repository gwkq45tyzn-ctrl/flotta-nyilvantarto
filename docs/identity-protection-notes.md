# V1 Counter-based Identity Protection Notes

## Technique
Applied the #136 isolated list-range + counter delta protocol to the real `firestore-v1-restricted.rules`.

- `identity.daCnt` / `identity.plateCnt` maps (normalized keys).
- Single-row change enforced via `oldList[0:idx]` / `[idx+1:]` range equality.
- Counter transition: old count==1, new key not present, delta only on the two keys.
- Booking additionally requires the selected identity's counter == 1.

## Authentic initial counters
Create is denied. The trusted migration/Admin SDK seed **must** compute and store correct counters matching the lists. Poisoned counters (count=1 for duplicates) remain a known limitation of any client-supplied map; Rules cannot recompute global uniqueness without loops.

## #133 five attacks
All five direct-SDK attacks are denied by the new Rules when authentic counters are used:
1. Identical DA insert — multi-row / bad transition denied.
2. Forged second DA index booking — counter !=1.
3. Mixed-case DA duplicate booking — counter !=1.
4. Forged second plate index booking — counter !=1.
5. Normalized duplicate plate insert — multi-row / bad transition denied.

## Original Flotta operation
Client bridge (`features/firestore-bridge.js`) now computes authentic counters from the snapshot and supplies `lastChange` with the first differing row index. Multi-row simultaneous edits are denied (fail-closed). Single-row rich edits continue to work.

## Unsolved / documented
- Full multi-row batch edits in one transaction are not supported by the single-row protocol.
- Existing emulator tests that do bare `updateDoc({revision: N})` without identity fields will fail until adapted.
- Admin SDK / privileged seed can still poison counters; this is inherent.

No production deploy or main merge performed.
