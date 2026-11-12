# Trusted signer contract status – 2026-11-12

**Base:** #234 `c4264d3933a45e1cb46c06c918881acfaa3e7400`

## Added
- `tools/v1-trusted-signer-contract.mjs`: fails closed without an external owner registry entry.
- Caller-selected signer ID is rejected.
- Matching registry allows dry verification but never seals.

## Honest boundary
This is a local contract. It does not prove a production owner key, out-of-band registration, or privileged importer. The P0 poisoned privileged-seed job remains intentionally RED.

**Scoped Grok GO** for the local trusted-signer contract.  
**Full V1 NO-GO**.

No production, no main merge, no live migration.
