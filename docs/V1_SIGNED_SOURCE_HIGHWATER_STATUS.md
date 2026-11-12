# Signed source highwater status – 2026-11-12

**Base:** #240 `d61710e3187e909a6219f42920f62e8ca0259560`

## Added
- `tools/v1-signed-source-highwater.mjs`: fails closed without external privileged isolation.
- Even with a flag, privileged bypass can still reset the highwater.
- Never seals.

## Honest boundary
This is a local design. A privileged Admin SDK process can still `setDoc` the highwater back to an earlier sequence. Client Rules do not stop it. The P0 poisoned privileged-seed job remains intentionally RED.

**Scoped Grok GO** for the local signed-source highwater design.  
**Full V1 NO-GO**.

No production, no main merge, no live migration.
