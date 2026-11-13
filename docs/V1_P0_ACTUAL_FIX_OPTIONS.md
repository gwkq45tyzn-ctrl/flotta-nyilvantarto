# P0 actual fix options – 2026-11-13

**Base:** #247 `6b03132185de257200b6d9c2f1b81b86d2258f57`

## Residual risk
A privileged-seeded normalized-duplicate source still allows index-zero booking. Firestore Rules cannot compute normalized uniqueness over arbitrary arrays after the fact. An Admin SDK writer can also reset highwater or seed a poisoned source.

## What does not fix it
- UI hardstop on duplicates (already present in #247).
- Always-rejecting local models or flags.
- Client Rules alone.

## What would actually fix it
1. **Privileged importer with external trust root**  
   Only a separately authenticated service principal can write the sealed source and highwater. The importer refuses any source that fails preflight (duplicates, sourceIndex, hash drift) before any write.

2. **Least-privilege IAM isolation**  
   No other principal (browser, Apps Script, other service accounts) can write the sealed collections or highwater document.

3. **Durable anti-rollback**  
   Highwater is protected by the same isolated principal; a privileged reset is impossible without that identity.

## What remains external
- Real privileged importer / IAM that enforces the attestation and inventory before seal.
- Independently authenticated source signer and key registration.
- Live Apps Script inventory.

**Until those exist, full V1 remains NO-GO.** Do not weaken the P0 test.
