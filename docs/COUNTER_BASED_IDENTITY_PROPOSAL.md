# Counter-Based Identity Protection – Proposal

**Status:** PROPOSAL – not yet proven to deny all five #133 attacks.

## Problem
Firestore Rules cannot iterate arrays. Direct SDK can insert duplicate DA codes or plates into `flottaSharedState/current` and then book by selecting an eligible index. Claim documents only record a chosen row; they do not prove whole-array uniqueness.

## Counter-based approach
Require that every Fleet update:
1. Changes exactly one row (prefix and suffix unchanged).
2. Has a count delta of +1 (insert), 0 (edit), or -1 (delete).
3. The changed row's normalized identity does not already exist in the unchanged portion.
4. Revision is monotonic.

## Limitation
Rules cannot compare the changed row against every other row without iteration. A counter check can reject bulk inserts, but a single-row insert of a duplicate identity cannot be proven absent by Rules alone.

## Structural alternative
Move to one document per driver and one document per vehicle, with the document ID being the normalized identity. Uniqueness becomes a property of Firestore document IDs. This requires a migration and changes the original Flotta array model, but preserves rich history in the document body.

## Current status
Not implemented. The #133 attacks remain open. Claim-only protection is partial and does not deny the five attacks if the attacker also writes the claim.
