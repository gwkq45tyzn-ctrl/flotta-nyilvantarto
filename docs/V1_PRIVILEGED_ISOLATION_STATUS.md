# Privileged isolation status – 2026-11-12

**Base:** #247 `6b03132185de257200b6d9c2f1b81b86d2258f57`

## Added
- `tools/v1-privileged-isolation-model.mjs`: fails closed without external IAM isolation.
- Even with a flag, Admin SDK bypass remains possible.
- Never seals.

## Honest boundary
This is a local model. A privileged Admin SDK process can still rewrite highwater or seed a poisoned source. Client Rules and UI hardstops do not stop it. The original P0 poisoned privileged-seed job remains intentionally RED.

**Scoped Grok GO** for the local privileged isolation model.  
**Full V1 NO-GO**.

No production, no main merge, no live migration.
