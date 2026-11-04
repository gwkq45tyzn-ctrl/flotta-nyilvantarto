# ÁTADÁS A CHATGPT-NEK – S7 live projection (Grok, 2026-11-04)

**Ág:** `grok/v1-s7-live-projection`  
**Base:** `integration/v1-flotta-depo-go-candidate-20261104` (#101)  
**HEAD:** (ez a commit)  
**Döntés:** **NO-GO**

## 1. S7 – amit csináltam
A Depó `drivers()`, `vehicles()` és `planning()` nézetei most a **Flotta kanonikus projekcióját** használják, ha a `flottaSharedState` szerver-visszaigazolt és preview-ready.

- Flotta írás → `flottaSharedState/current` → Depó onSnapshot → projekció → UI.
- Nincs kézi másolás vagy újraimport.
- A külön `/drivers` és `/vehicles` csak fallback, ha a shared state nincs kész.
- A rich history, insurance, fuel cards, contacts csak a Flotta snapshotban maradnak.
- Aktív foglalások továbbra is a projekció ID-jaira (plate / daCode) hivatkoznak.

## 2. Tesztek [T]
```bash
node --test depokapacitas/canonical-display.test.mjs
```
3/3 pass.

## 3. Mi maradt
- Valódi Firestore transaction adapter a Depó oldalon (re-read inside booking).
- Élő kétböngészős E2E a staging Firebase-en.
- Rules deploy, UID csere, valós migráció (jóváhagyás után).
- Apps Script hard disable.

## 4. GO / NO-GO
**NO-GO.**  
Az S7 display path működik a projekcióval. Élő E2E és jóváhagyott migráció nincs.

**Jelölés:** [S] statikus, [T] automatizált, [E] emulator, [B] böngésző, [L] live, [N] nem ellenőrzött.
