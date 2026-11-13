# P0 status on #254 – 2026-11-13

**SHA:** `34bfa17931502c0af1515c8c6ac280945e952cb0`

## Residual risk
A privileged-seeded normalized-duplicate source still allows index-zero booking. Firestore Rules cannot compute normalized uniqueness over arbitrary arrays after the fact. An Admin SDK writer can also reset highwater or seed a poisoned source.

## What #254 improves
- Capacity preflight and unknown-status hardstop.
- Backup validator reuses real four-array preflight.
- UI hardstop on duplicates (from #247).

## What does not fix the P0
- UI hardstop.
- Local always-reject models.
- Client Rules alone.

## Actual remaining fix
Privileged importer with external trust root + least-privilege IAM isolation + durable anti-rollback that a privileged writer cannot reset.

**Until those exist, full V1 remains NO-GO.** Do not weaken the P0 test.
