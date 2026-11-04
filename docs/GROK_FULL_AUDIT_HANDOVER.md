# ÁTADÁS A CHATGPT-NEK ÉS CLAUDE-NAK – S7 P0 drift fix (Grok, 2026-11-04)

**Ág:** `grok/v1-s7-fix-p0-drift`  
**Base:** `grok/v1-s7-canonical-rules` (1287c09)  
**HEAD:** (ez a commit)  
**Döntés:** **NO-GO**

## 1. #106 P0 független ellenőrzés
A #106 (f250dc5) emulator teszt bizonyítja:
- Flotta `updateDoc(flottaSharedState)` sikeres, rich history megmarad.
- A booking `driver_depot_projection_drift` / `vehicle_depot_projection_drift` miatt elutasítva.
- Közvetlen mirror `updateDoc` permission-denied.
- Csak rollback után nyílik újra a booking.

Ez a tervezett hiba, nem megoldás.

## 2. Amit csináltam
- A bridge `pushTransactional` már projekciózza a szigorú `/drivers` és `/vehicles` dokumentumokat ugyanabban a tranzakcióban (1287c09).
- A Rules most helyesen zárójelezi a két utat:
  - import előtt: admin seed
  - import után: csak ugyanabban a tranzakcióban, ahol a `flottaSharedState` is frissül (`getAfter` revision + 1)
- Közvetlen böngészős mirror-szerkesztés import után továbbra is tiltott.

## 3. Tesztek [T]
```bash
node --test features/s7-projection-contract.test.mjs
```
2/2 pass.

## 4. Mi maradt
- Valódi Firebase emulator + kétböngészős teszt a pozitív edit→project→book útra.
- Rules emulator teszt a getAfter feltételre.
- A #106 negatív tanú marad, amíg a pozitív út nem zöld.

## 5. GO / NO-GO
**NO-GO.**  
Az S7 atomic projection path megvan és a rules precedencia javítva. Élő E2E és jóváhagyott migráció nincs.

**Jelölés:** [S] statikus, [T] automatizált, [E] emulator, [B] böngésző, [L] live, [N] nem ellenőrzött.
