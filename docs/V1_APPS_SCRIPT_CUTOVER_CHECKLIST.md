# Apps Script cutover checklist – read-only evidence only

**Status: NO-GO.** No live changes performed.

## Required evidence before any future authorized cutover

1. Private inventory of every Apps Script project linked to the authorized Google account:
   - Script ID, version, owner, execution identity
   - Active triggers (time-driven / installable)
   - Linked Sheet IDs (redacted)
   - Webapp deployment URLs (redacted)
   - Actual write destination (Fleet source / attendance / other)

2. Classification for each verified deployment:
   - Fleet legacy writer
   - Attendance writer
   - Read-only
   - Unknown

3. Local emulator confirmation that after seal:
   - Stale original Fleet browser cannot write flottaSharedState or keyed masters
   - Live keyed capacity still reaches Depot

4. Complete backup + source SHA proof before any shutoff.

**All items currently UNKNOWN.** Do not invent IDs or disable anything.

No production, no main merge, no live trigger deletion.
