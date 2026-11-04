# Szűkített V1 scope (2026-11-04)

**Cél:** a meglévő Flotta + Depó rendszer biztonságos, működőképes első kiadása.  
**Halasztva V1.1-re vagy későbbre:** OFD Monitoring, In-Hub Inventory, Excel-riportok, Attendance PWA, fotó/courier feature-ök.

## V1-ben benne van
- Eredeti Flotta Nyilvántartó (`index.html`) teljes funkcionalitással.
- Egyetlen közös Firebase fiók (imilemanagement) + single-UID rules.
- Flotta–Depó közös törzsadat (vehicles/drivers) a shared-master-adapterrel.
- Valós idejű szinkron, conflict/offline/revoked kezelés.
- Migrációs dry-run (rekurzív hash, 1 MiB probe), privát backup terv.
- Apps Script gated no-op; hard stop jóváhagyás után.

## V1-ben nincs
- In-Hub / OFD Excel riportok.
- Attendance PWA, fotó, vehicleSessions.
- Courier self-service auth útvonalak (deferred a restricted rulesben).

## S1–S12 igazítás a szűkített V1-hez
- S8 (riportok): **nem része a kiadásnak** – nem blokkoló.
- S12 (courier/Attendance): **nem része a kiadásnak** – a restricted rules deferred állapotban tartja.
- S1–S7, S9–S11: továbbra is kötelező bizonyíték a GO-hoz.
