# Durable registry antirollback status – 2026-11-12

**Base:** #237 `d501a719b7408d12482506e0fdc78ef4b22a09e6`

## Added
- `tools/v1-durable-registry-antirollback.mjs`: fails closed without an external durable high-water.
- Stale registry sequence is rejected.
- Sequence at or above high-water allows dry check but never seals.

## Honest boundary
This is a local design. A new process without external high-water cannot accept an old registry. It does not prove a production durable store, trusted clock, or privileged importer. The P0 poisoned privileged-seed job remains intentionally RED.

**Scoped Grok GO** for the local durable antirollback design.  
**Full V1 NO-GO**.

No production, no main merge, no live migration.
