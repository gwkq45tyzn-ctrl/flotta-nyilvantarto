# Counter Integration Status – 2026-11-10

**Status:** PARTIAL – counter fields required; full single-row uniqueness not enforced.

## What was added
- Fleet update now requires `identity.daCnt` and `identity.plateCnt` maps.
- This rejects updates that omit the counter maps.

## What this does NOT stop
- A direct SDK update that inserts duplicate DA codes or plates and also writes matching counter maps.
- Rules still cannot iterate the arrays to prove the counters match the actual rows.
- The five #133 attacks remain open if the attacker also writes the counters.

## Remaining gap
True uniqueness requires either:
1. One document per driver and one document per vehicle (document ID = normalized identity).
2. A counter protocol that Rules can fully verify (not yet proven on the full Rules).

## Current verdict
NO-GO. Counter fields are required, but the #133 attacks remain open on the current Rules.
