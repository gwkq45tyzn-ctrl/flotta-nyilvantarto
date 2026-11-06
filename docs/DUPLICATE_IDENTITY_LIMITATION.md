# Duplicate Identity Server-Side Protection – Limitation

**Status:** KNOWN LIMITATION – not solved by current architecture.

## Problem
Firestore Rules cannot iterate over array elements to enforce uniqueness of normalized DA codes or plates within `flottaSharedState/current`. Direct SDK writes can:
1. Insert duplicate DA codes.
2. Insert duplicate normalized plates.
3. Book by selecting the eligible index when a duplicate exists.

## Current protection
- Booking transaction fails closed if normalized DA or plate appears more than once (client-side).
- Rules recompute eligibility from original `rendszam` and `daCode` fields.
- Rules reject Unicode lookalikes and non-ASCII separators.

## Why Rules cannot enforce this
- Rules have no `for` loop or array iteration.
- `getAfter` can access a specific index, but cannot search the array.
- Uniqueness would require either:
  - A Cloud Function (not free / not allowed).
  - A separate uniqueness document per identity written in the same transaction (complex, not yet implemented).

## Safe alternative (not yet implemented)
Write a `flottaIdentityClaims/{normalizedId}` document in the same transaction as any Fleet update that adds or changes a DA or plate. Rules would require that the claim document does not already exist for a different index. This preserves the rich Flotta structure but requires a transaction wrapper for all Fleet writes.

## Recommendation
Do not mark as solved. The client-side check is a defense-in-depth measure, not a server-side hard-stop. True server-side uniqueness requires the alternative above or a Cloud Function.

**No live changes in this document.**
