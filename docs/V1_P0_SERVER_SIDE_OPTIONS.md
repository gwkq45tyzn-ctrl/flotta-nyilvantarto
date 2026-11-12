# P0 server-side solution options – 2026-11-12

**SHA base:** #225 `6b961a859f4c34756f5acb36295a4488b36c5908`

## Residual risk
A privileged-seeded normalized-duplicate source still allows index-zero booking. Rules cannot prove uniqueness after the fact. Four collection scans are not atomic (TOCTOU).

## Options within free-tool / no-IAM scope
1. **Attestation before any seal** (already present)  
   Refuse to seal poisoned sources. Local adapter does this.

2. **Atomic pre-seal inventory** (this PR)  
   Explicitly refuse seal when relying on non-atomic scans. Require a trusted privileged importer for any future seal.

3. **External trust-root bootstrap** (this PR)  
   Caller cannot swap the pinned key. Revocation and expiry checked. No production key invented.

## What remains external
- Real privileged importer / IAM that enforces attestation + inventory atomically.
- Independently authenticated source signer and key registration.
- Live Apps Script inventory.

**Until those exist, full V1 remains NO-GO.** Do not weaken the P0 test.
