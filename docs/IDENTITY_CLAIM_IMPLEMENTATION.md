# Identity Claim Implementation – 2026-11-10

**Status:** PARTIAL – claims required for booking; Fleet array uniqueness still not enforced by Rules.

## What was added
- `/flottaDriverClaims/{normalizedDa}` and `/flottaVehicleClaims/{normalizedPlate}` match blocks.
- Booking create now requires that the claim for the driverId and vehicleId exists and that its `sourceIndex` matches the booking's index.
- Claim write requires that the Fleet document's selected row normalizes to the claim ID.

## What this stops
- A booking that selects an index whose identity does not match the claim for that normalized ID.
- A booking that has no claim for the selected identity.

## What this does NOT stop
- A direct SDK update that inserts duplicate DA codes or plates into the Fleet arrays.
- A direct SDK update that also writes a claim for only one of the duplicates.
- Rules still cannot iterate the arrays to reject the Fleet update itself.

## Remaining gap
The #133 attacks that insert duplicates into the Fleet document and then book by selecting the eligible index are still possible if the attacker also writes the corresponding claim. The claim makes the attack harder (the attacker must also write the claim in the same transaction), but does not make it impossible.

## Next step
A true structural hard-stop requires one document per driver and one document per vehicle, with the document ID being the normalized identity. That changes the original Flotta array model and requires a migration.
