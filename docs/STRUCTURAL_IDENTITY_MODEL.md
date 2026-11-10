# Structural Identity Model – Required for True Hard-Stop

**Status:** REQUIRED – counter maps alone do not prevent duplicates.

## Problem
#141 proved that requiring `identity.daCnt` and `identity.plateCnt` maps does not prevent:
- Duplicate DA inserted with truthful count=2.
- Duplicate DA inserted with forged count=1.
- Same for plates.
- Original bridge save fails because it does not include the identity maps.

## Structural solution
Move to one document per driver and one document per vehicle:
- `/flottaDrivers/{normalizedDa}` → full driver record with history.
- `/flottaVehicles/{normalizedPlate}` → full vehicle record with history.

The document ID is the normalized identity. Firestore itself enforces uniqueness: you cannot create two documents with the same ID.

## Migration path
1. Seed the new documents from the existing Fleet arrays in a privileged process.
2. Update the bridge to write to the new documents instead of the arrays.
3. Update booking rules to check the new documents.
4. Keep the original Fleet document as a read-only snapshot for the original UI.

## Current status
Not implemented. The #133 and #141 attacks remain open on the current Rules. The counter requirement has been removed to restore original bridge save functionality.
