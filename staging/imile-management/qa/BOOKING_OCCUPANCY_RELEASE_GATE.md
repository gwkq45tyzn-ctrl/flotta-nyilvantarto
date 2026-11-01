# #26 – draft occupancy protection, NOT enabled in Firebase

Same-day means the server's Europe/Budapest calendar day (EU DST). A car issued
to another DA cannot be reserved today. The same DA may reserve its own issued
car. Today's physical use does not block a different day's plan. Existing
vehicle/driver status, capacity, booking/driverClaim atomicity and RBAC remain.
The reverse direction is enforced too: another DA cannot check out a car already
reserved today. This closes conflicting concurrent booking/checkout commits.

## Mandatory trusted Attendance projection – unresolved release dependency

Firestore Rules cannot query and reduce an arbitrary collection of Attendance
events. Client filtering alone is insufficient. This prototype therefore fails
closed for today's bookings unless an IAM-controlled projection is present:

`attendanceVehicleGuards/{YYYY-MM-DD__PLATE}`

    {date, vehicleId, state: 'clear'|'assigned'|'blocked', driverId,
     source: 'trusted-attendance-projection-v1', confirmedAt: Timestamp}

`clear` has an empty driverId; `assigned` names a validated DA; `blocked` never
authorizes a booking. The receipt is valid for 120 seconds and cannot be future
dated. Browser admin/editor/viewer cannot write it. Vehicle-bearing Attendance
events are likewise publisher-only (including deletion and field removal);
legacy Attendance without a vehicle remains compatible. Rules protect direct
booking writes even if the browser UI is bypassed. A changed projection or a
physical assignment read inside the client transaction forces conflict/retry.

**No publisher is created, deployed or approved by this PR.** No paid backend is
enabled. With the current cloud data, this version would intentionally disable
today's booking form; future planning remains available. Do not merge/deploy
until the data owner approves the policy and an authorized implementation proves:

* All vehicle-bearing Attendance ingestion, corrections and removals maintain
  the projection atomically with the source change. A periodic/asynchronous
  refresh alone is NOT sufficient; the 120-second TTL does not prevent an
  ingestion-to-projection race.
* The projection includes complete event history and late/out-of-order arrivals,
  retains incomplete returns, marks contradictions blocked, and runs idempotently.
* IAM writers are restricted/audited; no alternative source writer can bypass
  the atomic contract. Admin SDK writes bypass Security Rules.
* Approved clock/day policy and same-DA behavior receive business acceptance.
* Browser/emulator QA and a separate rollout check are complete. Never seed a
  fake `clear` guard in the cloud to make the form usable.

The existing published staging stays at its prior commit; #23 and #24 are not
merged here. This branch starts at 7224d626 and touches no legacy export, main,
Google sheet, cloud rule, production site or business document.

Tests: pure synthetic occupancy/DST cases; compiled role/clearance/expiry,
same/other DA, tomorrow, forged projection, late authoritative change and
concurrent reverse-direction cases. Historical DST boundaries invoke the exact
production date helper via a test-only rule path, never included in a release.

Reference: https://firebase.google.com/docs/reference/rules/rules.Timestamp
