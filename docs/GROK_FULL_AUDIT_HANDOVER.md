# ÁTADÁS A CHATGPT-NEK ÉS CLAUDE-NAK – S7 atomic projection (Grok, 2026-11-04)

**Ág:** `grok/v1-s7-canonical-rules`  
**Base:** `qa/v1-canonical-freshness-ui-20261104` (#103, 525b058)  
**HEAD:** (ez a commit)  
**Döntés:** **NO-GO**

## 1. S7 – amit csináltam
A Flotta `pushTransactional` most ugyanabban a Firestore-tranzakcióban projekciózza a szigorú `/drivers` és `/vehicles` dokumentumokat.

- Flotta mentés → `flottaSharedState` + projekció írása egy tranzakcióban.
- A Rules csak akkor engedi a mirror írást, ha a `flottaSharedState` is frissül ugyanabban a tranzakcióban (`getAfter` revision + 1).
- Közvetlen böngészős mirror-szerkesztés import után továbbra is tiltott.
- A rich history, insurance, fuel cards, contacts csak a Flotta snapshotban maradnak.
- Nincs kézi másolás; a Depó onSnapshot a frissített mirrorokat látja.

## 2. Tesztek [T]
```bash
node --test features/s7-projection-contract.test.mjs
```
2/2 pass.

## 3. Mi maradt
- Valódi Firebase emulator + kétböngészős teszt a tényleges app kóddal.
- Rules emulator teszt a getAfter feltételre.
- Rules deploy, UID csere, valós migráció (jóváhagyás után).

## 4. GO / NO-GO
**NO-GO.**  
Az S7 atomic projection path megvan. Élő E2E és jóváhagyott migráció nincs.

**Jelölés:** [S] statikus, [T] automatizált, [E] emulator, [B] böngésző, [L] live, [N] nem ellenőrzött.
