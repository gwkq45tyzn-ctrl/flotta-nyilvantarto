# P0 poisoned-source residual risk – 2026-11-11

**SHA base:** #200 `679558b4819ad194b9c4eb5541373a5e698ac48c`

## Finding
The `p0-poisoned-privileged-source-hardstop` job fails because a **privileged-seeded** duplicate DA/plate source allows an index-zero booking under the current Rules.

This is expected: Firestore Rules cannot compute normalized uniqueness over arbitrary client-supplied arrays after the fact. The only defensible gate is the **importer attestation** that refuses to seal a poisoned source.

## Current protection
- `attestBeforeSeal` / `preflight` reject duplicate normalized DA and plate **before any seal**.
- `refusePoisonedSeal` always returns `sealed: false`.
- Post-seal keyed masters and claims are immutable for the client.
- The residual risk exists **only if a privileged process seals a poisoned source**.

## Required for full V1 GO
A real privileged importer (outside free-tool local emulator) must:
1. Run full preflight + attestation.
2. Refuse seal on any duplicate / sourceIndex / hash drift.
3. Write keyed masters and claims only after successful attestation.
4. Never expose `withSecurityRulesDisabled` to production clients.

Until that importer exists and is independently verified, **full V1 remains NO-GO**.

**No production, no main merge, no live migration.**
