# V1 Release Blockers (2026-11-04)

| Blocker | Reproduction | Fix | Test | Status |
|---------|--------------|-----|------|--------|
| Rapid second save drops edit | features/firestore-bridge.runtime-regressions.test.cjs: two rapid saves expected 200 actual 0 | Requeue logic exists; needs harness-compatible fix | runtime-regressions | OPEN |
| normalizedPlate forgery | Direct SDK sets normalizedPlate to forged value, books different plate | Rules check normalizedPlate; residual risk if rules cannot prove derivation | v1-acceptance | OPEN (documented residual) |
| Canon-only first-time capacity | No preseeded driverCapacities, booking fails | Booking falls back to Flotta kapacitas | capacity-from-fleet | PARTIAL |
| Duplicate DA/plate books | Direct SDK selects one index among duplicates | Booking gate validates; rules check selected index only | v1-acceptance | OPEN |
| Mirror writes post-import | /vehicles still writable with revision bump | Closed in rules | no-mirror-rules | CLOSED |
| getAfter same-tx service+booking | Transaction sets service and books | Rules use getAfter | normalize-and-getafter | CLOSED |
| Empty arrays Index out of bound | existsAfter(drivers[0]) on empty | Removed | single-source | CLOSED |
| Pre-import localStorage overwrite | applySnapshot before verified import | Read-only gate + token | preimport-protect | CLOSED |

## Acceptance contract
features/v1-acceptance.test.mjs: 10/10 pass [T]

## Remaining for GO
- Real Firebase emulator acceptance suite (#106-#118 witnesses as PERMISSION_DENIED)
- Two-browser Flotta→Depó post-import UI chain
- Synthetic backup/restore SHA parity
- Rapid save fix
- normalizedPlate derivation proof or model redesign
- Rules deploy, UID swap, real migration (after approval)
