# Identity Claim Proposal – Server-Side Uniqueness

**Status:** PROPOSAL – not yet proven in emulator.

## Problem
Firestore Rules cannot iterate arrays. Direct SDK can insert duplicate DA codes or plates into `flottaSharedState/current` and then book by selecting an eligible index.

## Proposed model
Each normalized DA code and plate gets a claim document:
- `/flottaDriverClaims/{normalizedDa}` → `{ sourceIndex, revision }`
- `/flottaVehicleClaims/{normalizedPlate}` → `{ sourceIndex, revision }`

## Booking rule addition
A booking is allowed only if:
1. The claim document for the driverId exists.
2. The claim document for the vehicleId exists.
3. The claim's sourceIndex matches the booking's driverIndex/vehicleIndex.
4. The claim's revision matches the Fleet document's revision.

## Fleet update rule addition
A Fleet update is allowed only if the client also writes the corresponding claim documents in the same transaction, and each claim points to a unique normalized identity.

## Limitation
Rules still cannot scan the array to reject a Fleet update that contains duplicates. The claim documents make it harder for a booking to succeed against a duplicate, but a privileged or carefully crafted direct SDK write can still create the claims.

## Safe alternative
Move to one document per driver and one document per vehicle, with the document ID being the normalized identity. This makes uniqueness a structural property of Firestore. It requires a migration and changes the original Flotta array model.

## Current status
Not implemented. The #133 attacks remain open. Client-side duplicate checks are defense-in-depth only.
