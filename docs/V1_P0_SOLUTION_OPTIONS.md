# P0 solution options – 2026-11-12

**SHA base:** #222 `148e6b00be86af899884be09fe7a93491fbbcaa7`

## Residual risk
A privileged-seeded normalized-duplicate source still allows index-zero booking under the current Rules. Firestore Rules cannot compute normalized uniqueness over arbitrary arrays after the fact.

## Options that stay within free-tool / no-IAM scope
1. **Importer attestation gate (already present)**  
   Refuse to seal any source that fails preflight (duplicates, sourceIndex, hash drift). The local adapter already does this. The residual risk exists only if a privileged process seals a poisoned source.

2. **Orphan inventory (this PR)**  
   Detect out-of-plan masters/claims before any seal attempt. Fail closed.

3. **External signed manifest (this PR)**  
   Require a separate trust root. Without it, always DENY. Never invent a production key.

## What is still external
- Real privileged importer / IAM that enforces the attestation and inventory before seal.
- Independently authenticated source signer.
- Live Apps Script inventory.

**Until those exist, full V1 remains NO-GO.** Do not weaken the P0 test.
