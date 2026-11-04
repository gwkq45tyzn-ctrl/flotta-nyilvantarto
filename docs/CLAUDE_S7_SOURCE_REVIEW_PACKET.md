# CLAUDE S7 SOURCE REVIEW PACKET – 2026-11-04

PRIVATE repo source copied into this QA-only file to permit user-mediated transfer to Claude **without GitHub access**. NO PRODUCTION DATA, Firebase credential values REDACTED; the browser API key was replaced with a redaction marker. Do not paste real credentials. This is NOT a deployable bundle. Not validated by Claude or used for real data.

**Frozen original baseline:** `525b058667ad4edc462c85109fd484b4edfe51ba` (#103). **Latest Grok code:** `bd7ef2db2772f388e7e72299c7487c580bdf3c64` (handover commit on `grok/v1-s7-sha-and-projection`). These are NOT a single integrated release commit; difference matters. #108 adversarial PR against Grok contains emulator test; confirm actual CI status separately.

**Critical exact repo facts:** The original `index.html` `snapshot()` contains precisely `{vehicles,fuelCards,drivers,contacts}`; Fleet `rendszam` may contain hyphens such as `ABC-123`, Depot normalized ID is `ABC123`; driver original field `daCode` normalized to `DA0001`; original `history`/insurance/fuelCards/contacts never belong in strict Depot docs. Existing `vehicleClaims` is **absent** from V1 restricted Rules and the current booking adapter: implementing your T8 against it without new proposed Rules is NOT valid. `driverClaims` is already an atomic reverse claim. Root `firebase.json` and root `firestore.indexes.json` returned GitHub 404 on baseline (not evidence they exist elsewhere); actual local config `firebase.staging-emulator.json` is included. Real Rules emulator loads restricted Rules into `initializeTestEnvironment(...firestore:{rules})` and substitutes only a synthetic UID; browser real cloud config must NOT be used for this local test.

**Security caveats:** Grok's latest Fleet Rule uses `existsAfter(...drivers[0])` and `existsAfter(...vehicles[0].rendszam)`. `existsAfter` proves future existence, NOT a write to that document. It dereferences `[0]` even when arrays empty, and uses unnormalized plate path; this is a major NO-GO. Also `depotIndex` would be a NEW field rejected by existing full-source four-array restore parity until the audit explicitly defines/validates the new schema; it is not yet implemented. There is no `vehicleClaims` in actual code. Treat your T1/T2/T3/T6/T8 as hypothetical tests; adapt to exact Rules and Node's `node:test` API, seeded `users/{uid}` and approval timestamp, before executing. Firestore emulator result cannot prove live quotas or a real migration.

### Complete requested source contents (each section is a copy of the specified GitHub commit, except labelled excerpts)

## Original V1 restricted Firestore Rules COMPLETE – `525b058667ad4edc462c85109fd484b4edfe51ba`

```js
// V1-RESTRICTED CANDIDATE — NOT DEPLOYABLE AS WRITTEN.
// Single-UID placeholder is deliberate; future courier/PWA features denied.
// Generated from Grok full feature Rules at cb1ea15b58322a73e903f0535d49a88af73aca08.
// Keep this separate from staging firestore.rules until two-agent independent GO.

rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // STAGING ONLY. No anonymous access or direct client self-registration.
    function signedIn() {
      // V1 internal portal is STRICTLY single account, not merely any active
      // member or a matching email. UID stays intentionally unconfigured.
      return request.auth != null
        && request.auth.uid == 'REPLACE_WITH_REAL_SHARED_UID'
        && request.auth.token.email == 'imilemanagement@imile-management-staging.firebaseapp.com'
        && exists(userPath())
        && get(userPath()).data.active == true
        && get(userPath()).data.role in ['admin','editor','viewer'];
    }
    function userPath() { return /databases/$(database)/documents/users/$(request.auth.uid); }
    function member() {
      return signedIn() && exists(userPath()) && get(userPath()).data.active == true
        && get(userPath()).data.role in ['admin','editor','viewer'];
    }
    function admin() { return member() && get(userPath()).data.role == 'admin'; }
    function editor() { return member() && get(userPath()).data.role in ['admin','editor']; }

    function exactFields(data, fields) {
      return data.keys().hasOnly(fields) && data.keys().hasAll(fields);
    }
    function textField(value, maximum) {
      return value is string && value.size() > 0 && value.size() <= maximum;
    }
    function optionalText(value, maximum) {
      return value is string && value.size() <= maximum;
    }
    function validDay(value) {
      // 1900–2199 calendar dates, including Gregorian leap-year rules.
      return value is string && (
        value.matches('^(19|20|21)[0-9]{2}-(01|03|05|07|08|10|12)-(0[1-9]|[12][0-9]|3[01])$')
        || value.matches('^(19|20|21)[0-9]{2}-(04|06|09|11)-(0[1-9]|[12][0-9]|30)$')
        || value.matches('^(19|20|21)[0-9]{2}-02-(0[1-9]|1[0-9]|2[0-8])$')
        || value.matches('^(19([02468][48]|[13579][26]|[2468]0)|20([02468][048]|[13579][26])|21([02468][48]|[13579][26]|[2468]0))-02-29$')
      );
    }
    function validEventTime(value, day) {
      return value is string && validDay(day)
        && value.matches('^' + day + 'T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$');
    }
    function nonNegative(value, maximum) {
      return value is int && value >= 0 && value <= maximum;
    }
    function validDriverCode(value) {
      return value is string && value.matches('^[A-Z0-9_-]{4,40}$');
    }
    function validVehiclePlate(value) {
      return value is string && value.matches('^[A-Z0-9]{4,12}$');
    }
    function declaredDriverCapacity(driverId) {
      let capacity = get(/databases/$(database)/documents/driverCapacities/$(driverId));
      return capacity != null ? capacity.data.capacity
        : get(/databases/$(database)/documents/drivers/$(driverId)).data.capacity;
    }

    // New independent Attendance PWA. Separate self-service courier principal,
    // never a member of the internal Depo/Flotta admin roles.
    function courierPath() {
      return /databases/$(database)/documents/courierAccess/$(request.auth.uid);
    }
    function courier() {
      // External courier/PWA and photo workflows are deferred beyond V1.
      // Do NOT enable courier access under the single internal account.
      return false;
    }
    function sessionPath(id) {
      return /databases/$(database)/documents/vehicleSessions/$(id);
    }
    function vehicleLockPath(plate) {
      return /databases/$(database)/documents/vehicleLocks/$(plate);
    }
    function courierLockPath(uid) {
      return /databases/$(database)/documents/courierLocks/$(uid);
    }
    function driverLockPath(driverId) {
      return /databases/$(database)/documents/driverLocks/$(driverId);
    }
    function checkPhotos(paths,uid,sid,stage) {
      return paths is map
        && paths.keys().hasAll(['front','left','right','back','cabinFront','cabinRear','cargo'])
        && paths.keys().hasOnly(['front','left','right','back','cabinFront','cabinRear','cargo'])
        && paths.front == 'attendance/' + uid + '/' + sid + '/' + stage + '/front.jpg'
        && paths.left == 'attendance/' + uid + '/' + sid + '/' + stage + '/left.jpg'
        && paths.right == 'attendance/' + uid + '/' + sid + '/' + stage + '/right.jpg'
        && paths.back == 'attendance/' + uid + '/' + sid + '/' + stage + '/back.jpg'
        && paths.cabinFront == 'attendance/' + uid + '/' + sid + '/' + stage + '/cabinFront.jpg'
        && paths.cabinRear == 'attendance/' + uid + '/' + sid + '/' + stage + '/cabinRear.jpg'
        && paths.cargo == 'attendance/' + uid + '/' + sid + '/' + stage + '/cargo.jpg';
    }
    // A filename map does not prove that Storage objects exist. A separately
    // approved IAM verifier must inspect all immutable objects before issuing
    // this receipt. No browser role, including admin, can manufacture it.
    // One server-issued capability per courier. Browser roles cannot mint,
    // replace or remove it; quota counters/leases/journals are also server-only.
    function validPhotoPermit(uid,sid,stage) {
      let a = get(/databases/$(database)/documents/courierAccess/$(uid)).data;
      let p = a.photoUploadPermit;
      return p is map && p.source == 'upload-quota-v1' && p.version == 1
        && p.status == 'open' && p.uid == uid && p.driverId == a.driverId && p.sessionId == sid
        && p.createdAt is timestamp && p.createdAt <= request.time
        && (stage == 'in' ? p.inExpiresAt is timestamp && p.inExpiresAt > request.time
                            && p.resumeUntil is timestamp && p.resumeUntil > request.time && p.inExpiresAt <= p.resumeUntil
                          : p.outExpiresAt is timestamp && p.outExpiresAt > request.time);
    }
    function trustedPhotos(paths,uid,sid,stage) {
      let proof = get(/databases/$(database)/documents/photoReceipts/$(uid)/sessions/$(sid)/stages/$(stage));
      return proof != null && proof.data.uid == uid && proof.data.sessionId == sid
        && proof.data.stage == stage && proof.data.source == 'storage-verifier-v1'
        && proof.data.verified == true && proof.data.paths == paths
        && proof.data.verifiedAt is timestamp && proof.data.verifiedAt <= request.time
        && validPhotoPermit(uid,sid,stage);
    }
    function currentVehicleMileage(plate,km) {
      let record = get(/databases/$(database)/documents/fleetRecords/$('vehicle__' + plate));
      return record == null || km >= record.data.data.mileage;
    }
    function validReviewChecks(data,session) {
      return exactFields(data,['carPresent','keyPresent','clean','damageReviewed','cleanlinessReviewed'])
        && data.carPresent == true && data.keyPresent == true && data.clean == true
        && data.damageReviewed is bool && data.cleanlinessReviewed is bool
        && (session.damageNote == '' || data.damageReviewed == true)
        && (!('cleanlinessNote' in session) || session.cleanlinessNote == '' || data.cleanlinessReviewed == true);
    }
    match /photoReceipts/{uid}/sessions/{sid}/stages/{stage} {
      allow get: if signedIn() && (request.auth.uid == uid || member());
      allow list: if member();
      allow create, update, delete: if false;
    }

    // Company-car headcount planning; no driver/vehicle plate preassignment.
    match /courierDayPlans/{key} {
      allow read: if member();
      allow create, update: if editor()
        && exactFields(request.resource.data,['date','driverId','status','changedAt','changedBy'])
        && validDay(request.resource.data.date)
        && validDriverCode(request.resource.data.driverId)
        && key == request.resource.data.date + '__' + request.resource.data.driverId
        && exists(/databases/$(database)/documents/drivers/$(request.resource.data.driverId))
        && get(/databases/$(database)/documents/drivers/$(request.resource.data.driverId)).data.active == true
        && request.resource.data.status in ['planned','confirmed','cancelled']
        && request.resource.data.changedAt == request.time
        && request.resource.data.changedBy == request.auth.uid
        && (resource == null
          || (resource.data.date == request.resource.data.date
            && resource.data.driverId == request.resource.data.driverId));
      allow delete: if false;
    }

    match /courierAccess/{uid} {
      allow get: if signedIn() && (request.auth.uid == uid || member());
      allow list: if member();
      allow create: if admin()
        && validCourierAccess(request.resource.data,uid)
        && exactFields(request.resource.data,['uid','driverId','active'])
        && request.resource.data.uid == uid
        && validDriverCode(request.resource.data.driverId)
        && request.resource.data.active is bool
        && exists(/databases/$(database)/documents/drivers/$(request.resource.data.driverId));
      allow update: if admin() && validCourierAccess(request.resource.data,uid)
        && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['uid','driverId','active']);
      allow delete: if false;
    }
    function validCourierAccess(data,uid) {
      return data.keys().hasOnly(['uid','driverId','active','photoUploadPermit'])
        && data.keys().hasAll(['uid','driverId','active']) && data.uid == uid
        && validDriverCode(data.driverId) && data.active is bool
        && exists(/databases/$(database)/documents/drivers/$(data.driverId));
    }
    // Permit ledger: immutable session binding, bounded timestamps and server
    // status; quotas: integer used/extra; leases: canonical DA; requests: hash of
    // UID+idempotency key; policy: versioned limits; adminOps: reason/actor/time.
    // Admin SDK validates all schemas. ALL browser writes, including admin,
    // are denied. No fallback or client-authored privileged control documents.
    match /photoUploadPermits/{sid} {
      allow get: if admin() || (signedIn() && resource.data.uid == request.auth.uid);
      allow list: if admin();
      allow create, update, delete: if false;
    }
    match /photoUploadQuotas/{id} { allow read: if admin(); allow write: if false; }
    match /photoUploadLeases/{id} { allow read: if admin(); allow write: if false; }
    match /photoUploadRequests/{id} { allow read: if admin(); allow write: if false; }
    match /photoUploadPolicy/{id} { allow read: if admin(); allow write: if false; }
    match /photoUploadAdminOps/{id} { allow read: if admin(); allow write: if false; }
    match /vehicleSessions/{sid} {
      // The client transaction must read its new (not-yet-existing) ID before
      // creating it. Missing-document reads disclose no other courier's record.
      allow get: if member() || (courier() && (resource == null || resource.data.uid == request.auth.uid));
      allow list: if member() || (courier() && resource.data.uid == request.auth.uid);
      allow create: if courier()
        && sid.matches('^s_[a-f0-9]{32}$')
        && exactFields(request.resource.data,[
          'uid','driverId','plate','status','startKm','endKm','inPhotos','outPhotos',
          'damageNote','cleanlinessNote','keyDropped','reviewChecks','startedAt','endedAt','reviewedAt','reviewedBy'])
        && request.resource.data.uid == request.auth.uid
        && request.resource.data.driverId == get(courierPath()).data.driverId
        && validVehiclePlate(request.resource.data.plate)
        && request.resource.data.status == 'active'
        && nonNegative(request.resource.data.startKm,100000000)
        && currentVehicleMileage(request.resource.data.plate,request.resource.data.startKm)
        && request.resource.data.endKm == null && request.resource.data.outPhotos == {}
        && request.resource.data.damageNote == ''
        && request.resource.data.cleanlinessNote == '' && request.resource.data.keyDropped == false
        && request.resource.data.reviewChecks == {}
        && request.resource.data.startedAt == request.time
        && request.resource.data.endedAt == null
        && request.resource.data.reviewedAt == null
        && request.resource.data.reviewedBy == ''
        && checkPhotos(request.resource.data.inPhotos,request.auth.uid,sid,'in')
        && trustedPhotos(request.resource.data.inPhotos,request.auth.uid,sid,'in')
        && get(/databases/$(database)/documents/drivers/$(request.resource.data.driverId)).data.active == true
        && get(/databases/$(database)/documents/vehicles/$(request.resource.data.plate)).data.status == 'Elérhető'
        && (!exists(/databases/$(database)/documents/fleetAssignments/$(request.resource.data.plate))
          || get(/databases/$(database)/documents/fleetAssignments/$(request.resource.data.plate)).data.active == false)
        && (!exists(/databases/$(database)/documents/fleetDriverAssignments/$(request.resource.data.driverId))
          || get(/databases/$(database)/documents/fleetDriverAssignments/$(request.resource.data.driverId)).data.active == false)
        && existsAfter(vehicleLockPath(request.resource.data.plate))
        && getAfter(vehicleLockPath(request.resource.data.plate)).data.sessionId == sid
        && existsAfter(courierLockPath(request.auth.uid))
        && getAfter(courierLockPath(request.auth.uid)).data.sessionId == sid
        && existsAfter(driverLockPath(request.resource.data.driverId))
        && getAfter(driverLockPath(request.resource.data.driverId)).data.sessionId == sid
        && getAfter(driverLockPath(request.resource.data.driverId)).data.uid == request.auth.uid;
      allow update: if (
        // Courier's once-only checkout; cannot change original issue or identity.
        courier() && resource.data.uid == request.auth.uid
        && resource.data.status == 'active'
        && request.resource.data.diff(resource.data).affectedKeys().hasOnly([
          'status','endKm','outPhotos','damageNote','cleanlinessNote','keyDropped','endedAt'])
        && request.resource.data.status == 'awaiting_review'
        && nonNegative(request.resource.data.endKm,100000000)
        && request.resource.data.endKm >= resource.data.startKm
        && checkPhotos(request.resource.data.outPhotos,resource.data.uid,sid,'out')
        && trustedPhotos(request.resource.data.outPhotos,resource.data.uid,sid,'out')
        && optionalText(request.resource.data.damageNote,1000)
        && optionalText(request.resource.data.cleanlinessNote,1000) && request.resource.data.keyDropped == true
        && request.resource.data.endedAt == request.time
        && getAfter(vehicleLockPath(resource.data.plate)).data.state == 'awaiting_review'
        && getAfter(courierLockPath(resource.data.uid)).data.state == 'awaiting_review'
        && getAfter(driverLockPath(resource.data.driverId)).data.state == 'awaiting_review'
      ) || (
        // Depot manager returns only a checked-out car; never free without
        // co-transactional deletion of ALL three possession locks.
        editor() && resource.data.status == 'awaiting_review'
        && request.resource.data.diff(resource.data).affectedKeys().hasOnly([
          'status','reviewChecks','reviewedAt','reviewedBy'])
        && request.resource.data.status == 'reviewed'
        && request.resource.data.reviewedAt == request.time
        && request.resource.data.reviewedBy == request.auth.uid
        && validReviewChecks(request.resource.data.reviewChecks,resource.data)
        && getAfter(/databases/$(database)/documents/fleetRecords/$('vehicle__' + resource.data.plate)).data.data.mileage >= resource.data.endKm
        && !existsAfter(vehicleLockPath(resource.data.plate))
        && !existsAfter(courierLockPath(resource.data.uid))
        && !existsAfter(driverLockPath(resource.data.driverId))
      );
      allow delete: if false;
    }
    match /vehicleLocks/{plate} {
      allow read: if member() || courier();
      allow create: if courier() && validVehiclePlate(plate)
        && exactFields(request.resource.data,['plate','uid','driverId','sessionId','state'])
        && request.resource.data.plate == plate
        && request.resource.data.uid == request.auth.uid
        && request.resource.data.driverId == get(courierPath()).data.driverId
        && request.resource.data.state == 'active'
        && existsAfter(sessionPath(request.resource.data.sessionId))
        && getAfter(sessionPath(request.resource.data.sessionId)).data.plate == plate
        && getAfter(sessionPath(request.resource.data.sessionId)).data.uid == request.auth.uid
        && existsAfter(courierLockPath(request.auth.uid))
        && getAfter(courierLockPath(request.auth.uid)).data.sessionId == request.resource.data.sessionId;
      allow update: if courier() && resource.data.uid == request.auth.uid
        && resource.data.state == 'active' && request.resource.data.state == 'awaiting_review'
        && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['state'])
        && getAfter(sessionPath(resource.data.sessionId)).data.status == 'awaiting_review';
      allow delete: if editor()
        && getAfter(sessionPath(resource.data.sessionId)).data.status == 'reviewed'
        && !existsAfter(courierLockPath(resource.data.uid));
    }
    // An authenticated UID alone is not a unique human. Two accounts may
    // accidentally be provisioned with the same DA code. A canonical DA lock
    // prevents the same driver from taking two different vehicles.
    match /driverLocks/{driverId} {
      allow get: if member() || (courier()
        && driverId == get(courierPath()).data.driverId);
      allow list: if member();
      allow create: if courier() && validDriverCode(driverId)
        && driverId == get(courierPath()).data.driverId
        && exactFields(request.resource.data,['driverId','plate','uid','sessionId','state'])
        && request.resource.data.driverId == driverId
        && request.resource.data.uid == request.auth.uid
        && validVehiclePlate(request.resource.data.plate)
        && request.resource.data.state == 'active'
        && existsAfter(sessionPath(request.resource.data.sessionId))
        && getAfter(sessionPath(request.resource.data.sessionId)).data.uid == request.auth.uid
        && getAfter(sessionPath(request.resource.data.sessionId)).data.driverId == driverId
        && getAfter(sessionPath(request.resource.data.sessionId)).data.plate == request.resource.data.plate
        && existsAfter(courierLockPath(request.auth.uid))
        && getAfter(courierLockPath(request.auth.uid)).data.sessionId == request.resource.data.sessionId;
      allow update: if courier() && resource.data.uid == request.auth.uid
        && driverId == get(courierPath()).data.driverId
        && resource.data.state == 'active'
        && request.resource.data.state == 'awaiting_review'
        && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['state'])
        && getAfter(sessionPath(resource.data.sessionId)).data.status == 'awaiting_review';
      allow delete: if editor()
        && getAfter(sessionPath(resource.data.sessionId)).data.status == 'reviewed'
        && !existsAfter(courierLockPath(resource.data.uid));
    }
    match /courierLocks/{uid} {
      allow get: if (signedIn() && uid == request.auth.uid) || member();
      allow list: if member();
      allow create: if courier() && uid == request.auth.uid
        && exactFields(request.resource.data,['plate','sessionId','state'])
        && request.resource.data.state == 'active'
        && validVehiclePlate(request.resource.data.plate)
        && existsAfter(sessionPath(request.resource.data.sessionId))
        && getAfter(sessionPath(request.resource.data.sessionId)).data.uid == uid
        && existsAfter(vehicleLockPath(request.resource.data.plate))
        && getAfter(vehicleLockPath(request.resource.data.plate)).data.sessionId == request.resource.data.sessionId;
      allow update: if courier() && uid == request.auth.uid
        && resource.data.state == 'active' && request.resource.data.state == 'awaiting_review'
        && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['state'])
        && getAfter(sessionPath(resource.data.sessionId)).data.status == 'awaiting_review';
      allow delete: if editor()
        && getAfter(sessionPath(resource.data.sessionId)).data.status == 'reviewed'
        && !existsAfter(vehicleLockPath(resource.data.plate));
    }

    match /users/{uid} {
      // V1 deliberately has ONE existing manually provisioned shared account.
      // No browser can invite extra profiles or change the only account's
      // role/active status; approved Firebase-console administration only.
      allow get: if signedIn() && request.auth.uid == uid;
      allow list, create, update, delete: if false;
    }

    match /drivers/{driverId} {
      allow read: if member();
      // Imported Fleet is canonical. A browser must not change strict Depot
      // mirrors independently after the migration is approved.
      allow create, update: if admin()
        && !exists(/databases/$(database)/documents/flottaSharedState/current)
        && exactFields(request.resource.data,['name','daCode','vendor','capacity','active'])
        && validDriverCode(driverId)
        && request.resource.data.daCode == driverId
        && textField(request.resource.data.name,160)
        && optionalText(request.resource.data.vendor,160)
        && nonNegative(request.resource.data.capacity,10000)
        && request.resource.data.active is bool;
      allow delete: if false;
    }

    match /vehicles/{vehicleId} {
      allow read: if member() || courier();
      // Direct SDK/old-client mirror edits are denied after canonical import.
      allow create, update: if admin()
        && !exists(/databases/$(database)/documents/flottaSharedState/current)
        && exactFields(request.resource.data,['plate','model','status'])
        && validVehiclePlate(vehicleId)
        && request.resource.data.plate == vehicleId
        && optionalText(request.resource.data.model,160)
        && request.resource.data.status in ['Elérhető','Szerviz','Leállított'];
      allow delete: if false;
    }

    match /driverCapacities/{driverId} {
      allow read: if member();
      allow create, update: if editor()
        && validDriverCode(driverId)
        && exists(/databases/$(database)/documents/drivers/$(driverId))
        && exactFields(request.resource.data,['capacity'])
        && nonNegative(request.resource.data.capacity,10000);
      allow delete: if editor();
    }

    match /demands/{id} {
      allow read: if member();
      allow create, update: if editor()
        && exactFields(request.resource.data,['date','district','newCount','retryCount'])
        && validDay(request.resource.data.date)
        && textField(request.resource.data.district,60)
        && id == request.resource.data.date + '__' + request.resource.data.district
        && nonNegative(request.resource.data.newCount,10000000)
        && nonNegative(request.resource.data.retryCount,10000000);
      allow delete: if editor();
    }

    match /results/{id} {
      allow read: if member();
      allow create, update: if editor()
        && exactFields(request.resource.data,['date','driverId','district','picked','success','failed'])
        && validDay(request.resource.data.date)
        && validDriverCode(request.resource.data.driverId)
        && exists(/databases/$(database)/documents/drivers/$(request.resource.data.driverId))
        && textField(request.resource.data.district,60)
        && id == request.resource.data.date + '__' + request.resource.data.driverId + '__' + request.resource.data.district
        && nonNegative(request.resource.data.picked,10000000)
        && nonNegative(request.resource.data.success,10000000)
        && nonNegative(request.resource.data.failed,10000000)
        && request.resource.data.success + request.resource.data.failed <= request.resource.data.picked;
      allow delete: if editor();
    }

    // QA26: Europe/Budapest calendar day, using EU DST boundaries at 01:00 UTC.
    function budapestDayAt(now) {
      let y = now.year();
      let march = timestamp.date(y,3,31);
      let october = timestamp.date(y,10,31);
      let start = march - duration.value(march.dayOfWeek() % 7,'d') + duration.value(1,'h');
      let end = october - duration.value(october.dayOfWeek() % 7,'d') + duration.value(1,'h');
      return (now + duration.value(now >= start && now < end ? 2 : 1,'h')).date();
    }
    function bookingDay(d) { return timestamp.date(int(d.date[0:4]),int(d.date[5:7]),int(d.date[8:10])); }
    function depotDayKey(now) {
      let d = budapestDayAt(now);
      return string(d.year()) + '-' + (d.month() < 10 ? '0' : '') + string(d.month())
        + '-' + (d.day() < 10 ? '0' : '') + string(d.day());
    }
    function checkoutBookingCompatible(d) {
      let day = depotDayKey(request.time);
      let p = /databases/$(database)/documents/bookings/$(day + '__' + d.vehicleId);
      let reverse = /databases/$(database)/documents/driverClaims/$(day + '__' + d.driverId);
      return (!exists(p) || get(p).data.driverId == d.driverId)
        && (!exists(reverse) || get(reverse).data.bookingId == day + '__' + d.vehicleId);
    }
    function bookingDriverOccupancy(d) {
      let p = /databases/$(database)/documents/fleetDriverAssignments/$(d.driverId);
      let b = getAfter(/databases/$(database)/documents/bookings/$(d.bookingId)).data;
      return bookingDay(d) != budapestDayAt(request.time) || !exists(p)
        || get(p).data.active == false
        || (get(p).data.active == true && get(p).data.vehicleId == b.vehicleId);
    }
    function sameDayOccupancy(d) {
      let manual = /databases/$(database)/documents/fleetAssignments/$(d.vehicleId);
      let guard = /databases/$(database)/documents/attendanceVehicleGuards/$(d.date + '__' + d.vehicleId);
      return bookingDay(d) != budapestDayAt(request.time) || (
        (!exists(manual) || get(manual).data.active == false
          || (get(manual).data.active == true && get(manual).data.driverId == d.driverId))
        && !exists(vehicleLockPath(d.vehicleId))
        && exists(guard)
        && get(guard).data.date == d.date && get(guard).data.vehicleId == d.vehicleId
        && get(guard).data.source == 'trusted-attendance-projection-v1'
        && get(guard).data.confirmedAt is timestamp
        && get(guard).data.confirmedAt <= request.time
        && get(guard).data.confirmedAt >= request.time - duration.value(120,'s')
        && ((get(guard).data.state == 'clear' && get(guard).data.driverId == '')
          || (get(guard).data.state == 'assigned' && get(guard).data.driverId == d.driverId))
      );
    }
    match /attendanceVehicleGuards/{id} {
      // A complete, atomically maintained trusted projection is a RELEASE GATE.
      // Browser admins/editors cannot forge clearance; no publisher is enabled here.
      allow read: if member();
      allow write: if false;
    }
    match /bookings/{bookingId} {
      allow read: if member();
      // No direct SDK/old-client booking create before original Fleet import.
      allow create: if editor()
        && canonicalImportActive()
        && exactFields(request.resource.data,['date','vehicleId','driverId','district','status','capacity'])
        && validDay(request.resource.data.date)
        && sameDayOccupancy(request.resource.data)
        && validVehiclePlate(request.resource.data.vehicleId)
        && validDriverCode(request.resource.data.driverId)
        && optionalText(request.resource.data.district,60)
        && bookingId == request.resource.data.date + '__' + request.resource.data.vehicleId
        && request.resource.data.status in ['planned','confirmed']
        && get(/databases/$(database)/documents/vehicles/$(request.resource.data.vehicleId)).data.status == 'Elérhető'
        && get(/databases/$(database)/documents/drivers/$(request.resource.data.driverId)).data.active == true
        && nonNegative(request.resource.data.capacity,10000)
        && request.resource.data.capacity == declaredDriverCapacity(request.resource.data.driverId)
        // Both documents must be written in one transaction. This prevents double booking.
        && existsAfter(/databases/$(database)/documents/driverClaims/$(request.resource.data.date + '__' + request.resource.data.driverId))
        && getAfter(/databases/$(database)/documents/driverClaims/$(request.resource.data.date + '__' + request.resource.data.driverId)).data.bookingId == bookingId
        && getAfter(/databases/$(database)/documents/driverClaims/$(request.resource.data.date + '__' + request.resource.data.driverId)).data.date == request.resource.data.date
        && getAfter(/databases/$(database)/documents/driverClaims/$(request.resource.data.date + '__' + request.resource.data.driverId)).data.driverId == request.resource.data.driverId;
      allow update: if false;
      allow delete: if editor()
        && !existsAfter(/databases/$(database)/documents/driverClaims/$(resource.data.date + '__' + resource.data.driverId));
    }

    match /driverClaims/{key} {
      allow read: if member();
      allow create: if editor()
        && exactFields(request.resource.data,['date','driverId','bookingId'])
        && validDay(request.resource.data.date)
        && bookingDriverOccupancy(request.resource.data)
        && validDriverCode(request.resource.data.driverId)
        && textField(request.resource.data.bookingId,120)
        && key == request.resource.data.date + '__' + request.resource.data.driverId
        && existsAfter(/databases/$(database)/documents/bookings/$(request.resource.data.bookingId))
        && getAfter(/databases/$(database)/documents/bookings/$(request.resource.data.bookingId)).data.date == request.resource.data.date
        && getAfter(/databases/$(database)/documents/bookings/$(request.resource.data.bookingId)).data.driverId == request.resource.data.driverId
        && request.resource.data.bookingId == request.resource.data.date + '__' + getAfter(/databases/$(database)/documents/bookings/$(request.resource.data.bookingId)).data.vehicleId;
      allow update: if false;
      allow delete: if editor()
        && !existsAfter(/databases/$(database)/documents/bookings/$(resource.data.bookingId));
    }

    match /attendance/{id} {
      allow read: if member();
      // Apps Script uses IAM; manual browser uploads are authorized for editors only.
      allow create, update: if editor()
        // Vehicle-bearing events must come through the future atomic trusted publisher.
        // Otherwise an editor could bypass the occupancy guard by modifying its input.
        && !('vehicleId' in request.resource.data)
        && (request.method == 'create' || !('vehicleId' in resource.data))
        // Existing 16-column Attendance events remain valid. The optional
        // vehicleId appears only after the Google source adds car selection.
        && (exactFields(request.resource.data,[
          'eventTime','eventDate','timeKnown','daCode','driverName','vendor',
          'type','status','photoFront','photoLeft','photoRight','photoBack','source'])
          || exactFields(request.resource.data,[
          'eventTime','eventDate','timeKnown','daCode','driverName','vendor',
          'type','status','photoFront','photoLeft','photoRight','photoBack','source','vehicleId']))
        && (!('vehicleId' in request.resource.data)
            || validVehiclePlate(request.resource.data.vehicleId))
        && validDay(request.resource.data.eventDate)
        && validEventTime(request.resource.data.eventTime,request.resource.data.eventDate)
        && request.resource.data.timeKnown is bool
        && validDriverCode(request.resource.data.daCode)
        && optionalText(request.resource.data.driverName,160)
        && optionalText(request.resource.data.vendor,160)
        && request.resource.data.type in ['Log In','Log Out']
        && optionalText(request.resource.data.status,100)
        && optionalText(request.resource.data.photoFront,2048)
        && optionalText(request.resource.data.photoLeft,2048)
        && optionalText(request.resource.data.photoRight,2048)
        && optionalText(request.resource.data.photoBack,2048)
        && textField(request.resource.data.source,256);
      allow delete: if admin() && !('vehicleId' in resource.data);
    }

    match /sourceRows/{id} {
      allow read: if member();
      allow create, update: if editor()
        && exactFields(request.resource.data,['source','content','importedAt'])
        && textField(request.resource.data.source,256)
        && request.resource.data.content is string
        && request.resource.data.content.size() <= 18000
        && request.resource.data.importedAt is string
        && request.resource.data.importedAt.matches('^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}$');
      allow delete: if admin();
    }


    // Fleet staging model: fleetRecords/{kind__key} is a bounded typed map,
    // versioned with immutable creator and server timestamps; no client deletion.
    // fleetAssignments/{plate} and fleetDriverAssignments/{DA} mirror one another.
    // fleetMovements/{autoId} is append-only; each movement and assignment pair
    // must be committed atomically. All collections require an active member.
    function fleetMileageFloor(d) {
      let p = /databases/$(database)/documents/fleetAssignments/$(d.vehicleId);
      return !existsAfter(p) || d.mileage >= getAfter(p).data.mileage;
    }
    function fleetMileageMatches(vehicleId,mileage) {
      let p = /databases/$(database)/documents/fleetRecords/$('vehicle__' + vehicleId);
      return existsAfter(p) && getAfter(p).data.data.mileage == mileage;
    }
    function fleetServiceMileage(d) {
      let p = /databases/$(database)/documents/fleetRecords/$('vehicle__' + d.vehicleId);
      return existsAfter(p) && getAfter(p).data.data.mileage >= d.mileage;
    }
    function validFleet_vehicle(d) { return exactFields(d,['vehicleId','make','vin','year','mileage','lessor','location','insuranceNumber','insuranceExpiry','cascoExpiry','inspectionExpiry','rentalExpiry','nextServiceDate','nextServiceMileage','tyresChanged','note'])
      && validVehiclePlate(d.vehicleId)
      && optionalText(d.make,160)
      && optionalText(d.vin,160)
      && nonNegative(d.year,100000000)
      && (d.year == 0 || (d.year >= 1900 && d.year <= 2199))
      && nonNegative(d.mileage,100000000) && fleetMileageFloor(d)
      && optionalText(d.lessor,160)
      && optionalText(d.location,160)
      && optionalText(d.insuranceNumber,160)
      && (d.insuranceExpiry == '' || validDay(d.insuranceExpiry))
      && (d.cascoExpiry == '' || validDay(d.cascoExpiry))
      && (d.inspectionExpiry == '' || validDay(d.inspectionExpiry))
      && (d.rentalExpiry == '' || validDay(d.rentalExpiry))
      && (d.nextServiceDate == '' || validDay(d.nextServiceDate))
      && nonNegative(d.nextServiceMileage,100000000)
      && d.tyresChanged is bool
      && optionalText(d.note,2000)
      && (d.vehicleId == '' || exists(/databases/$(database)/documents/vehicles/$(d.vehicleId))); }
    function validFleet_driver(d) { return exactFields(d,['driverId','phone','licenseExpiry','since','note'])
      && validDriverCode(d.driverId)
      && optionalText(d.phone,160)
      && (d.licenseExpiry == '' || validDay(d.licenseExpiry))
      && (d.since == '' || validDay(d.since))
      && optionalText(d.note,2000)
      && (d.driverId == '' || exists(/databases/$(database)/documents/drivers/$(d.driverId))); }
    function validFleet_fuel(d) { return exactFields(d,['code','provider','vehicleId','expiry','limit','active','note'])
      && validDriverCode(d.code)
      && optionalText(d.provider,160)
      && (d.vehicleId == '' || validVehiclePlate(d.vehicleId))
      && (d.expiry == '' || validDay(d.expiry))
      && nonNegative(d.limit,100000000)
      && d.active is bool
      && optionalText(d.note,2000)
      && (d.vehicleId == '' || exists(/databases/$(database)/documents/vehicles/$(d.vehicleId))); }
    function validFleet_phone(d) { return exactFields(d,['code','number','model','imei','driverId','active','note'])
      && validDriverCode(d.code)
      && optionalText(d.number,160)
      && optionalText(d.model,160)
      && optionalText(d.imei,160)
      && (d.driverId == '' || validDriverCode(d.driverId))
      && d.active is bool
      && optionalText(d.note,2000)
      && (d.driverId == '' || exists(/databases/$(database)/documents/drivers/$(d.driverId))); }
    function validFleet_contact(d) { return exactFields(d,['code','name','company','phone','email','active','note'])
      && validDriverCode(d.code)
      && textField(d.name,160)
      && optionalText(d.company,160)
      && optionalText(d.phone,160)
      && optionalText(d.email,160)
      && d.active is bool
      && optionalText(d.note,2000); }
    function validFleet_service(d) { return exactFields(d,['code','vehicleId','date','provider','mileage','cost','status','note'])
      && validDriverCode(d.code)
      && validVehiclePlate(d.vehicleId)
      && validDay(d.date)
      && optionalText(d.provider,160)
      && nonNegative(d.mileage,100000000)
      && nonNegative(d.cost,100000000)
      && d.status in ['Elérhető','Szerviz','Leállított']
      && optionalText(d.note,2000)
      && (d.vehicleId == '' || exists(/databases/$(database)/documents/vehicles/$(d.vehicleId)))
      && admin() && getAfter(/databases/$(database)/documents/vehicles/$(d.vehicleId)).data.status == d.status
      && fleetServiceMileage(d); }

    function validFleetRecord(id,d) {
      return exactFields(d,['kind','data','revision','createdAt','createdBy','updatedAt','updatedBy'])
        && d.data is map && d.revision is int && d.revision > 0 && d.revision <= 100000000
        && d.createdAt is timestamp && d.updatedAt == request.time
        && d.updatedBy == request.auth.uid && textField(d.createdBy,128)
        && ((d.kind == 'vehicle' && id == 'vehicle__' + d.data.vehicleId && validFleet_vehicle(d.data))
        || (d.kind == 'driver' && id == 'driver__' + d.data.driverId && validFleet_driver(d.data))
        || (d.kind == 'fuel' && id == 'fuel__' + d.data.code && validFleet_fuel(d.data))
        || (d.kind == 'phone' && id == 'phone__' + d.data.code && validFleet_phone(d.data))
        || (d.kind == 'contact' && id == 'contact__' + d.data.code && validFleet_contact(d.data))
        || (d.kind == 'service' && id == 'service__' + d.data.code && validFleet_service(d.data)));
    }
    match /fleetRecords/{id} {
      allow read: if member();
      allow create: if editor() && validFleetRecord(id,request.resource.data)
        && request.resource.data.revision == 1 && request.resource.data.createdAt == request.time
        && request.resource.data.createdBy == request.auth.uid;
      allow update: if editor() && validFleetRecord(id,request.resource.data)
        && request.resource.data.kind == resource.data.kind
        && request.resource.data.createdBy == resource.data.createdBy
        && request.resource.data.createdAt == resource.data.createdAt
        && request.resource.data.revision == resource.data.revision + 1
        && (resource.data.kind != 'vehicle' || request.resource.data.data.mileage >= resource.data.data.mileage);
      // Vehicle odometer corrections require an explicit administrative process.
      allow delete: if false;
    }
    function assignmentShape(d) {
      return exactFields(d,['vehicleId','driverId','active','mileage','operationId'])
        && validVehiclePlate(d.vehicleId) && validDriverCode(d.driverId)
        && d.active is bool && nonNegative(d.mileage,100000000)
        && d.operationId is string && d.operationId.matches('^[A-Za-z0-9]{20}$');
    }
    function assignmentEvent(d) {
      let p = /databases/$(database)/documents/fleetMovements/$(d.operationId);
      let e = getAfter(p).data;
      return !exists(p) && e.vehicleId == d.vehicleId && e.driverId == d.driverId
        && e.mileage == d.mileage && e.action == (d.active ? 'checkout' : 'return');
    }
    function assignmentTransition(d) {
      return ((!resource.data.active && d.active)
        || (resource.data.active && !d.active && d.vehicleId == resource.data.vehicleId
          && d.driverId == resource.data.driverId))
        && (d.vehicleId != resource.data.vehicleId || d.mileage >= resource.data.mileage);
    }
    match /fleetAssignments/{id} {
      allow read: if member();
      allow create: if editor() && assignmentShape(request.resource.data)
        && request.resource.data.vehicleId == id && request.resource.data.active
        && !exists(vehicleLockPath(id))
        && assignmentEvent(request.resource.data)
        && getAfter(/databases/$(database)/documents/fleetDriverAssignments/$(request.resource.data.driverId)).data == request.resource.data;
      allow update: if editor() && assignmentShape(request.resource.data)
        && request.resource.data.vehicleId == id && assignmentTransition(request.resource.data)
        && (!request.resource.data.active || !exists(vehicleLockPath(id)))
        && assignmentEvent(request.resource.data)
        && getAfter(/databases/$(database)/documents/fleetDriverAssignments/$(request.resource.data.driverId)).data == request.resource.data;
      allow delete: if false;
    }
    match /fleetDriverAssignments/{id} {
      allow read: if member();
      allow create: if editor() && assignmentShape(request.resource.data)
        && request.resource.data.driverId == id && request.resource.data.active
        && assignmentEvent(request.resource.data)
        && getAfter(/databases/$(database)/documents/fleetAssignments/$(request.resource.data.vehicleId)).data == request.resource.data;
      allow update: if editor() && assignmentShape(request.resource.data)
        && request.resource.data.driverId == id && assignmentTransition(request.resource.data)
        && assignmentEvent(request.resource.data)
        && getAfter(/databases/$(database)/documents/fleetAssignments/$(request.resource.data.vehicleId)).data == request.resource.data;
      allow delete: if false;
    }
    function validFleetReturnDate(d) {
      let prior = get(/databases/$(database)/documents/fleetAssignments/$(d.vehicleId)).data;
      let issued = get(/databases/$(database)/documents/fleetMovements/$(prior.operationId)).data;
      return issued.action == 'checkout' && issued.vehicleId == d.vehicleId
        && issued.driverId == d.driverId && validDay(issued.date) && d.date >= issued.date;
    }
    function validFleetMovement(id,d) {
      let v = get(/databases/$(database)/documents/vehicles/$(d.vehicleId)).data;
      let driver = get(/databases/$(database)/documents/drivers/$(d.driverId)).data;
      let a = getAfter(/databases/$(database)/documents/fleetAssignments/$(d.vehicleId)).data;
      let reverse = getAfter(/databases/$(database)/documents/fleetDriverAssignments/$(d.driverId)).data;
      return exactFields(d,['vehicleId','driverId','action','date','mileage','note','createdAt','createdBy'])
        && validVehiclePlate(d.vehicleId) && validDriverCode(d.driverId)
        && d.action in ['checkout','return'] && validDay(d.date)
        && (d.action != 'checkout' || checkoutBookingCompatible(d))
        && (d.action != 'checkout' || !exists(vehicleLockPath(d.vehicleId)))
        && nonNegative(d.mileage,100000000) && optionalText(d.note,2000)
        && d.createdAt == request.time && d.createdBy == request.auth.uid
        && a == reverse && a.operationId == id && a.vehicleId == d.vehicleId
        && a.driverId == d.driverId && a.mileage == d.mileage
        && fleetMileageMatches(d.vehicleId,d.mileage)
        && a.active == (d.action == 'checkout')
        && (d.action != 'checkout' || checkoutBookingCompatible(d))
        && (d.action != 'return' || validFleetReturnDate(d))
        && (d.action == 'return' || (driver.active == true && v.status == 'Elérhető'));
    }
    match /fleetMovements/{id} {
      allow read: if member();
      allow create: if editor() && validFleetMovement(id,request.resource.data);
      allow update,delete: if false;
    }

    // STAGING OFD performance archive. One current snapshot per day/station,
    // with an append-only, atomically linked audit event for every revision.
    // No report writes to Fleet, Attendance or capacity source collections.
    function validPerformanceSnapshot(id, d) {
      return exactFields(d,[
        'key','date','station','status','rows','totalOFD','totalDelivered',
        'courierCount','contentHash','sourceName','version','lastAuditId',
        'createdAt','createdBy','updatedAt','updatedBy'
      ])
        && d.key == id && validDay(d.date) && textField(d.station,160)
        && id.matches('^' + d.date + '__[^/]{1,240}')
        && d.status in ['provisional','final']
        && d.rows is list && d.rows.size() > 0 && d.rows.size() <= 300
        && nonNegative(d.totalOFD,10000000) && nonNegative(d.totalDelivered,10000000)
        && d.totalDelivered <= d.totalOFD
        && nonNegative(d.courierCount,300) && d.courierCount == d.rows.size()
        && d.contentHash is string && d.contentHash.matches('^[a-f0-9]{64}')
        && textField(d.sourceName,200)
        && d.version is int && d.version >= 1 && d.version <= 1000000
        && d.lastAuditId is string && d.lastAuditId.matches('^[A-Za-z0-9]{20}')
        && d.createdAt is timestamp && textField(d.createdBy,128)
        && d.updatedAt == request.time && d.updatedBy == request.auth.uid
        && existsAfter(/databases/$(database)/documents/performanceAudits/$(d.lastAuditId))
        && getAfter(/databases/$(database)/documents/performanceAudits/$(d.lastAuditId)).data.reportKey == id
        && getAfter(/databases/$(database)/documents/performanceAudits/$(d.lastAuditId)).data.version == d.version
        && getAfter(/databases/$(database)/documents/performanceAudits/$(d.lastAuditId)).data.contentHash == d.contentHash;
    }
    match /performanceDays/{id} {
      allow read: if member();
      allow create: if editor() && validPerformanceSnapshot(id,request.resource.data)
        && request.resource.data.version == 1
        && request.resource.data.createdAt == request.time
        && request.resource.data.createdBy == request.auth.uid;
      allow update: if editor() && validPerformanceSnapshot(id,request.resource.data)
        && request.resource.data.version == resource.data.version + 1
        && request.resource.data.createdAt == resource.data.createdAt
        && request.resource.data.createdBy == resource.data.createdBy
        && request.resource.data.lastAuditId != resource.data.lastAuditId
        && (resource.data.status != 'final' || request.resource.data.status == 'final');
      allow delete: if false;
    }
    function validPerformanceAudit(id, d) {
      return exactFields(d,[
        'reportKey','version','contentHash','priorHash','action','status',
        'actor','at','sourceName'
      ])
        && id.matches('^[A-Za-z0-9]{20}') && textField(d.reportKey,300)
        && d.version is int && d.version >= 1 && d.version <= 1000000
        && d.contentHash is string && d.contentHash.matches('^[a-f0-9]{64}')
        && d.priorHash is string && (d.priorHash == '' || d.priorHash.matches('^[a-f0-9]{64}'))
        && d.action in ['create','replace'] && d.status in ['provisional','final']
        && d.actor == request.auth.uid && d.at == request.time
        && textField(d.sourceName,200)
        && existsAfter(/databases/$(database)/documents/performanceDays/$(d.reportKey))
        && getAfter(/databases/$(database)/documents/performanceDays/$(d.reportKey)).data.lastAuditId == id
        && getAfter(/databases/$(database)/documents/performanceDays/$(d.reportKey)).data.version == d.version
        && getAfter(/databases/$(database)/documents/performanceDays/$(d.reportKey)).data.contentHash == d.contentHash
        && getAfter(/databases/$(database)/documents/performanceDays/$(d.reportKey)).data.status == d.status
        && ((!exists(/databases/$(database)/documents/performanceDays/$(d.reportKey))
          && d.action == 'create' && d.priorHash == '')
          || (exists(/databases/$(database)/documents/performanceDays/$(d.reportKey))
          && d.action == 'replace'
          && d.priorHash == get(/databases/$(database)/documents/performanceDays/$(d.reportKey)).data.contentHash));
    }
    match /performanceAudits/{id} {
      allow read: if member();
      allow create: if editor() && validPerformanceAudit(id,request.resource.data);
      allow update, delete: if false;
    }

    // STAGING daily warehouse inventory: aggregated only (never waybills).
    function validInventorySnapshot(id,d) {
      return exactFields(d,[
        'key','date','station','dates','areas','total','contentHash',
        'sourceName','version','lastAuditId','createdAt','createdBy','updatedAt','updatedBy'
      ])
      && d.key == id && validDay(d.date) && textField(d.station,160)
      && d.dates is list && d.dates.size() > 0 && d.dates.size() <= 180
      && d.areas is list && d.areas.size() > 0 && d.areas.size() <= 250
      && nonNegative(d.total,10000000)
      && d.contentHash is string && d.contentHash.matches('^[a-f0-9]{64}')
      && textField(d.sourceName,200)
      && d.version is int && d.version >= 1 && d.version <= 1000000
      && d.lastAuditId is string && d.lastAuditId.matches('^[A-Za-z0-9]{20}')
      && d.createdAt is timestamp && textField(d.createdBy,128)
      && d.updatedAt == request.time && d.updatedBy == request.auth.uid
      && existsAfter(/databases/$(database)/documents/inventoryAudits/$(d.lastAuditId))
      && getAfter(/databases/$(database)/documents/inventoryAudits/$(d.lastAuditId)).data.reportKey == id
      && getAfter(/databases/$(database)/documents/inventoryAudits/$(d.lastAuditId)).data.version == d.version
      && getAfter(/databases/$(database)/documents/inventoryAudits/$(d.lastAuditId)).data.contentHash == d.contentHash;
    }
    match /inventoryDays/{id} {
      allow read: if member();
      allow create: if editor() && validInventorySnapshot(id,request.resource.data)
        && request.resource.data.version == 1
        && request.resource.data.createdAt == request.time
        && request.resource.data.createdBy == request.auth.uid;
      allow update: if editor() && validInventorySnapshot(id,request.resource.data)
        && request.resource.data.version == resource.data.version + 1
        && request.resource.data.createdAt == resource.data.createdAt
        && request.resource.data.createdBy == resource.data.createdBy
        && request.resource.data.lastAuditId != resource.data.lastAuditId;
      allow delete: if false;
    }
    function validInventoryAudit(id,d) {
      return exactFields(d,['reportKey','version','contentHash','priorHash','action','actor','at','sourceName'])
        && id.matches('^[A-Za-z0-9]{20}') && textField(d.reportKey,300)
        && d.version is int && d.version >= 1 && d.version <= 1000000
        && d.contentHash is string && d.contentHash.matches('^[a-f0-9]{64}')
        && d.priorHash is string && (d.priorHash == '' || d.priorHash.matches('^[a-f0-9]{64}'))
        && d.action in ['create','replace']
        && d.actor == request.auth.uid && d.at == request.time
        && textField(d.sourceName,200)
        && existsAfter(/databases/$(database)/documents/inventoryDays/$(d.reportKey))
        && getAfter(/databases/$(database)/documents/inventoryDays/$(d.reportKey)).data.lastAuditId == id
        && getAfter(/databases/$(database)/documents/inventoryDays/$(d.reportKey)).data.version == d.version
        && getAfter(/databases/$(database)/documents/inventoryDays/$(d.reportKey)).data.contentHash == d.contentHash
        && ((!exists(/databases/$(database)/documents/inventoryDays/$(d.reportKey))
          && d.action == 'create' && d.priorHash == '')
         || (exists(/databases/$(database)/documents/inventoryDays/$(d.reportKey))
          && d.action == 'replace'
          && d.priorHash == get(/databases/$(database)/documents/inventoryDays/$(d.reportKey)).data.contentHash));
    }
    match /inventoryAudits/{id} {
      allow read: if member();
      allow create: if editor() && validInventoryAudit(id,request.resource.data);
      allow update, delete: if false;
    }

    
    // Migration may be approved only by a privileged import process, never
    // by client localStorage. Browser admin cannot create or mutate this gate.
    function isSharedFleetAccount() {
      return request.auth != null
        && request.auth.token.email == 'imilemanagement@imile-management-staging.firebaseapp.com'
        && request.auth.uid == 'REPLACE_WITH_REAL_SHARED_UID';
    }
    function approvedFleetMigration() {
      let p = /databases/$(database)/documents/flottaMigrationApproval/current;
      return exists(p)
        && get(p).data.status == 'approved'
        && get(p).data.approvedUid == request.auth.uid
        && get(p).data.sourceSha256 is string
        && get(p).data.sourceSha256.matches('^[a-f0-9]{64}$')
        && get(p).data.approvedAt is timestamp
        && get(p).data.approvedAt <= request.time;
    }
    // Read-only, source-linked original Fleet and approval must already be
    // seeded by a separately authorized and privileged migration process.
    // Any browser can read only after shared UID+role verification; no writes.
    function canonicalImportActive() {
      let fleet = /databases/$(database)/documents/flottaSharedState/current;
      let approval = /databases/$(database)/documents/flottaMigrationApproval/current;
      return isSharedFleetAccount()
        && approvedFleetMigration()
        && exists(fleet)
        && get(fleet).data.migrationSourceSha256 == get(approval).data.sourceSha256;
    }
    match /flottaMigrationApproval/{id} {
      allow get: if id == 'current' && isSharedFleetAccount() && member();
      allow list, create, update, delete: if false;
    }
    match /flottaSharedState/{docId} {
      allow read: if isSharedFleetAccount() && member();
      // The initial import must be seeded by a separate approved trusted process.
      allow create: if false;
      allow update: if docId == 'current'
        && isSharedFleetAccount()
        && editor()
        && approvedFleetMigration()
        // Imported original Fleet's source proof cannot be invented or changed
        // by any browser after the privileged seed.
        && resource.data.migrationSourceSha256 is string
        && resource.data.migrationSourceSha256 == get(/databases/$(database)/documents/flottaMigrationApproval/current).data.sourceSha256
        && request.resource.data.migrationSourceSha256 == resource.data.migrationSourceSha256
        && request.resource.data.keys().hasAll(['vehicles','drivers','fuelCards','contacts','revision','migrationSourceSha256'])
        && request.resource.data.revision is int
        && request.resource.data.revision == resource.data.revision + 1
        && request.resource.data.vehicles is list
        && request.resource.data.drivers is list
        && request.resource.data.fuelCards is list
        && request.resource.data.contacts is list;
      allow delete: if false;
    }

    match /{path=**} { allow read, write: if false; }
  }
}

```

## Grok latest S7 Rules CRITICAL SECTION – `bd7ef2db2772f388e7e72299c7487c580bdf3c64`

```js
match /drivers/{driverId} {
      allow read: if member();
      // Before import: admin may seed. After import: only the same transaction
      // that updates flottaSharedState may project the strict master.
      allow create, update: if (
          admin()
          && !exists(/databases/$(database)/documents/flottaSharedState/current)
          && exactFields(request.resource.data,['name','daCode','vendor','capacity','active'])
          && validDriverCode(driverId)
          && request.resource.data.daCode == driverId
          && textField(request.resource.data.name,160)
          && optionalText(request.resource.data.vendor,160)
          && nonNegative(request.resource.data.capacity,10000)
          && request.resource.data.active is bool
        ) || (
          editor()
          && existsAfter(/databases/$(database)/documents/flottaSharedState/current)
          && getAfter(/databases/$(database)/documents/flottaSharedState/current).data.revision ==
             get(/databases/$(database)/documents/flottaSharedState/current).data.revision + 1
          && exactFields(request.resource.data,['name','daCode','vendor','capacity','active'])
          && validDriverCode(driverId)
          && request.resource.data.daCode == driverId
        );
      allow delete: if false;
    }

    match /vehicles/{vehicleId} {
      allow read: if member() || courier();
      // Direct SDK/old-client mirror edits are denied after canonical import.
      // After import, only the same transaction that updates flottaSharedState may project.
      allow create, update: if (
          admin()
          && !exists(/databases/$(database)/documents/flottaSharedState/current)
          && exactFields(request.resource.data,['plate','model','status'])
          && validVehiclePlate(vehicleId)
          && request.resource.data.plate == vehicleId
          && optionalText(request.resource.data.model,160)
          && request.resource.data.status in ['Elérhető','Szerviz','Leállított']
        ) || (
          editor()
          && existsAfter(/databases/$(database)/documents/flottaSharedState/current)
          && getAfter(/databases/$(database)/documents/flottaSharedState/current).data.revision ==
             get(/databases/$(database)/documents/flottaSharedState/current).data.revision + 1
          && exactFields(request.resource.data,['plate','model','status'])
          && validVehiclePlate(vehicleId)
          && request.resource.data.plate == vehicleId
          && request.resource.data.status in ['Elérhető','Szerviz','Leállított']
        );
      allow delete: if false;
    }

    

function isSharedFleetAccount() {
      return request.auth != null
        && request.auth.token.email == 'imilemanagement@imile-management-staging.firebaseapp.com'
        && request.auth.uid == 'REPLACE_WITH_REAL_SHARED_UID';
    }
    function approvedFleetMigration() {
      let p = /databases/$(database)/documents/flottaMigrationApproval/current;
      return exists(p)
        && get(p).data.status == 'approved'
        && get(p).data.approvedUid == request.auth.uid
        && get(p).data.sourceSha256 is string
        && get(p).data.sourceSha256.matches('^[a-f0-9]{64}$')
        && get(p).data.approvedAt is timestamp
        && get(p).data.approvedAt <= request.time;
    }
    // Read-only, source-linked original Fleet and approval must already be
    // seeded by a separately authorized and privileged migration process.
    // Any browser can read only after shared UID+role verification; no writes.
    function canonicalImportActive() {
      let fleet = /databases/$(database)/documents/flottaSharedState/current;
      let approval = /databases/$(database)/documents/flottaMigrationApproval/current;
      return isSharedFleetAccount()
        && approvedFleetMigration()
        && exists(fleet)
        && get(fleet).data.migrationSourceSha256 == get(approval).data.sourceSha256;
    }
    match /flottaMigrationApproval/{id} {
      allow get: if id == 'current' && isSharedFleetAccount() && member();
      allow list, create, update, delete: if false;
    }
    match /flottaSharedState/{docId} {
      allow read: if isSharedFleetAccount() && member();
      // The initial import must be seeded by a separate approved trusted process.
      allow create: if false;
      allow update: if docId == 'current'
        && isSharedFleetAccount()
        && editor()
        && approvedFleetMigration()
        // Imported original Fleet's source proof cannot be invented or changed
        // by any browser after the privileged seed.
        && resource.data.migrationSourceSha256 is string
        && resource.data.migrationSourceSha256 == get(/databases/$(database)/documents/flottaMigrationApproval/current).data.sourceSha256
        && request.resource.data.migrationSourceSha256 == resource.data.migrationSourceSha256
        && request.resource.data.keys().hasAll(['vehicles','drivers','fuelCards','contacts','revision','migrationSourceSha256'])
        && request.resource.data.revision is int
        && request.resource.data.revision == resource.data.revision + 1
        && request.resource.data.vehicles is list
        && request.resource.data.drivers is list
        && request.resource.data.fuelCards is list
        && request.resource.data.contacts is list
        // S7: a Flotta update that changes masters must also project them
        // in the same transaction. Independent SDK edits that skip the
        // projection are denied. The booking gate still re-validates parity.
        && existsAfter(/databases/$(database)/documents/drivers/$(request.resource.data.drivers[0].daCode))
        && existsAfter(/databases/$(database)/documents/vehicles/$(request.resource.data.vehicles[0].rendszam));
      allow delete: if false;
    }

    
```

## Grok latest ORIGINAL Fleet bridge COMPLETE (browser API key redacted) – `bd7ef2db2772f388e7e72299c7487c580bdf3c64`

```js
/**
 * iMile Management – Firestore bridge for the original Flotta Nyilvántartó (v3).
 * Preserves the full original UI, logic and data model in index.html.
 * Single shared account, multi-computer real-time, transactional writes.
 * Firestore becomes the single source of truth; old Apps Script sync is gated.
 * Free Spark plan only.
 *
 * Fixes v2 blockers:
 * - UI unlocks only after successful Auth + member check (correct order)
 * - Page refresh resumes Firebase session; old fleetmanager session alone is insufficient
 * - onSnapshot never overwrites dirty local changes
 * - dirty flag and pending local changes stay until confirmed successful write
 * - Primary mode only after explicit verified import
 * - Conflict and offline fail closed
 */
(function () {
  'use strict';

  const FIREBASE_CONFIG = {
    apiKey: "[REDACTED_FIREBASE_BROWSER_API_KEY]",
    authDomain: "imile-management-staging.firebaseapp.com",
    projectId: "imile-management-staging",
    storageBucket: "imile-management-staging.firebasestorage.app",
    messagingSenderId: "91967139054",
    appId: "1:91967139054:web:37d68fd04cc9238e0857ff"
  };

  const SHARED_EMAIL = 'imilemanagement@imile-management-staging.firebaseapp.com';
  const SHARED_STATE = 'flottaSharedState/current';
  const MIGRATION_APPROVAL = 'flottaMigrationApproval/current';
  const LOCAL_CACHE = 'flotta_firestore_cache_v3';
  const PRIMARY_FLAG = 'flotta_firestore_primary';
  const IMPORT_VERIFIED = 'flotta_import_verified';

  let app, auth, db, unsub = null;
  let memberVerified = false;
  let migrationServerApproved = false;
  let savePatched = false;
  let legacySyncGated = false;
  let applyingRemote = false;
  let currentRevision = 0;
  let writeInFlight = false;
  let localDirty = false;
  let requeueCount = 0;
  const MAX_REQUEUE = 3;

  // Auth-state restoration and the login button can initialize Firebase at
  // the same time. A global firebase-app object alone does NOT mean auth and
  // firestore SDK modules have loaded. Share one complete initialization.
  let sdkLoading = null;
  let firebaseInitializing = null;
  function loadSdk() {
    const modules = [
      {ready: () => typeof window.firebase?.initializeApp === 'function',
        src: 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app-compat.js'},
      {ready: () => typeof window.firebase?.auth === 'function',
        src: 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth-compat.js'},
      {ready: () => typeof window.firebase?.firestore === 'function',
        src: 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore-compat.js'}
    ];
    if (modules.every(m => m.ready())) return new Promise(resolve => resolve());
    if (sdkLoading) return sdkLoading;
    sdkLoading = new Promise((resolve, reject) => {
      let i = 0;
      function next() {
        if (i >= modules.length) {
          if (modules.every(m => m.ready())) resolve();
          else reject(new Error('Firebase compat modules not fully initialized'));
          return;
        }
        const m = modules[i++];
        if (m.ready()) { next(); return; }
        const script = document.createElement('script');
        script.src = m.src;
        script.onload = next;
        script.onerror = () => reject(new Error('Cannot load Firebase compat SDK'));
        document.head.appendChild(script);
      }
      next();
    }).catch(error => { sdkLoading = null; throw error; });
    return sdkLoading;
  }

  function initFirebase() {
    if (app && auth && db) return new Promise(resolve => resolve());
    if (firebaseInitializing) return firebaseInitializing;
    firebaseInitializing = (async () => {
      await loadSdk();
      const existing = Array.isArray(firebase.apps) && firebase.apps.length
        ? firebase.app() : null;
      if (existing && existing.options.projectId !== FIREBASE_CONFIG.projectId)
        throw new Error('Unexpected Firebase project in shared Fleet session');
      const initialized = existing || firebase.initializeApp(FIREBASE_CONFIG);
      const initializedAuth = firebase.auth();
      const initializedDb = firebase.firestore();
      initializedDb.settings({ ignoreUndefinedProperties: true });
      app = initialized;
      auth = initializedAuth;
      db = initializedDb;
    })().catch(error => {
      firebaseInitializing = null;
      throw error;
    });
    return firebaseInitializing;
  }

  function status(text, error = false) {
    const el = document.getElementById('syncStatus');
    if (el) {
      el.textContent = text;
      el.style.color = error ? '#b91c1c' : '#065f46';
    }
  }

  // Browser storage alone is NEVER an import authorization. A server-only
  // read of an immutable approval record and an existing imported Fleet
  // snapshot are required, in addition to the Firestore Rules write gate.
  function isPrimary() {
    return migrationServerApproved === true &&
           localStorage.getItem(PRIMARY_FLAG) === '1' &&
           localStorage.getItem(IMPORT_VERIFIED) === '1';
  }

  function setPrimary(on) {
    if (on) localStorage.setItem(PRIMARY_FLAG, '1');
    else localStorage.removeItem(PRIMARY_FLAG);
  }

  function clearVerifiedMigration() {
    migrationServerApproved = false;
    setPrimary(false);
    localStorage.removeItem(IMPORT_VERIFIED);
    // Clear insecure legacy token if a previous build created it.
    localStorage.removeItem('flotta_migration_token');
  }

  async function verifyMigrationApproval() {
    clearVerifiedMigration();
    if (!memberVerified || !auth || !auth.currentUser || !db) return false;
    try {
      const gate = await db.doc(MIGRATION_APPROVAL).get({ source: 'server' });
      const policy = gate.exists ? gate.data() : null;
      if (!policy || policy.status !== 'approved' ||
          policy.approvedUid !== auth.currentUser.uid ||
          !/^[a-f0-9]{64}$/.test(policy.sourceSha256)) return false;
      // A missing Fleet snapshot is NOT a permitted import target. The source
      // must already have been migrated by an authorized privileged process.
      const fleet = await db.doc(SHARED_STATE).get({ source: 'server' });
      const data = fleet.exists ? fleet.data() : null;
      if (!data || !Number.isSafeInteger(data.revision) || data.revision < 1 ||
          !['vehicles','drivers','fuelCards','contacts'].every(k => Array.isArray(data[k])))
        return false;
      if (!memberVerified || !auth.currentUser ||
          auth.currentUser.uid !== policy.approvedUid) return false;
      migrationServerApproved = true;
      localStorage.setItem(IMPORT_VERIFIED, '1');
      setPrimary(true);
      return true;
    } catch (error) {
      // No cache fallback, no local token workaround and no optimistic unlock.
      console.warn('Fleet migration approval unavailable', error?.code || 'server-read');
      clearVerifiedMigration();
      return false;
    }
  }

  function applyRemote(data, confirmed) {
    // Critical: never overwrite local Flotta data before verified import.
    if (!isPrimary()) {
      status('Import előtt – távoli Firestore állapot nem írja felül a helyi Flotta adatot');
      return;
    }
    if (!data || applyingRemote || localDirty) {
      if (localDirty) status('Helyi nem mentett módosítás van – távoli frissítés várakozik');
      return;
    }
    applyingRemote = true;
    try {
      if (typeof applySnapshot === 'function') {
        applySnapshot({
          vehicles: Array.isArray(data.vehicles) ? data.vehicles : [],
          fuelCards: Array.isArray(data.fuelCards) ? data.fuelCards : [],
          drivers: Array.isArray(data.drivers) ? data.drivers : [],
          contacts: Array.isArray(data.contacts) ? data.contacts : []
        });
      }
      currentRevision = Number(data.revision) || 0;
      if (confirmed) {
        localStorage.setItem(LOCAL_CACHE, JSON.stringify({ ...data, revision: currentRevision }));
        status('Élő Firestore kapcsolat – közös állapot (rev ' + currentRevision + ')');
      } else {
        status('Gyorsítótárazott / visszaigazolásra váró adat – ne ments, amíg nem élő');
      }
    } finally {
      applyingRemote = false;
    }
  }

  function startListener() {
    if (unsub) unsub();
    const ref = db.doc(SHARED_STATE);
    unsub = ref.onSnapshot({ includeMetadataChanges: true }, (snap) => {
      const meta = snap.metadata;
      const confirmed = !meta.fromCache && !meta.hasPendingWrites;
      // Firestore compat DocumentSnapshot.exists is a BOOLEAN property;
      // the modular SDK exposes exists() as a method. Support both safely.
      const exists = typeof snap.exists === 'function' ? snap.exists() : snap.exists === true;
      if (!exists) {
        status(confirmed ? 'Firestore üres – ellenőrzött import szükséges a primary módhoz' : 'Offline / cache – Firestore állapot ismeretlen');
        return;
      }
      const data = snap.data();
      if (confirmed) {
        // Firestore cache / pending local writes are not server-confirmed and
        // must never replace the original Fleet snapshot and localStorage.
        applyRemote(data, true);
      } else {
        status(meta.fromCache
          ? 'Offline / gyorsítótár – távoli adat nem alkalmazható'
          : 'Firestore írás még nem igazolt – helyi adatot nem írjuk felül', true);
      }
    }, (err) => {
      console.error(err);
      status('Adatkapcsolati hiba: ' + (err.message || err), true);
    });
  }


  function projectStrictMasters(draft) {
    const plate = s => String(s || '').replace(/[\s-]/g, '').toUpperCase();
    const code = s => String(s || '').trim().toUpperCase();
    const drivers = (draft.drivers || []).map(d => {
      const id = code(d.daCode);
      if (!id) return null;
      return { id, data: { name: String(d.name || d.nev || '').trim(), daCode: id, vendor: String(d.agency || d.vendor || '').trim(), capacity: Number(d.kapacitas || d.capacity || 0), active: ['aktiv','aktív'].includes(String(d.status || '').toLowerCase()) } };
    }).filter(Boolean);
    const vehicles = (draft.vehicles || []).map(v => {
      const id = plate(v.rendszam);
      if (!id) return null;
      const model = [String(v.gyartmany || ''), String(v.modell || '')].filter(Boolean).join(' ');
      const st = String(v.status || '').toLowerCase();
      const status = ['aktiv','aktív'].includes(st) ? 'Elérhető' : st === 'szerviz' ? 'Szerviz' : 'Leállított';
      return { id, data: { plate: id, model, status } };
    }).filter(Boolean);
    return { drivers, vehicles };
  }

  async function pushTransactional() {
    if (applyingRemote || writeInFlight || !auth.currentUser || !isPrimary()) return;
    if (typeof snapshot !== 'function') return;
    writeInFlight = true;
    const draft = snapshot();
    const draftKey = JSON.stringify(draft);
    try {
      const newRev = await db.runTransaction(async (tx) => {
        const ref = db.doc(SHARED_STATE);
        const snap = await tx.get(ref);
        const serverRev = snap.exists ? (Number(snap.data().revision) || 0) : 0;
        if (serverRev !== currentRevision) {
          throw new Error('REVISION_CONFLICT');
        }
        const next = serverRev + 1;
        const existing = snap.exists ? snap.data() : {};
        const payload = {
          vehicles: draft.vehicles || [],
          fuelCards: draft.fuelCards || [],
          drivers: draft.drivers || [],
          contacts: draft.contacts || [],
          revision: next,
          migrationSourceSha256: existing.migrationSourceSha256 || '',
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
          updatedBy: auth.currentUser.uid
        };
        if (!payload.migrationSourceSha256) {
          throw new Error('MISSING_MIGRATION_SOURCE');
        }
        tx.set(ref, payload);
        // S7: project strict Depot masters in the same transaction.
        // Rules must allow these writes only when flottaSharedState is also written.
        const projected = projectStrictMasters(draft);
        for (const d of projected.drivers) {
          tx.set(db.doc('drivers/' + d.id), d.data);
        }
        for (const v of projected.vehicles) {
          tx.set(db.doc('vehicles/' + v.id), v.data);
        }
        return next;
      });
      currentRevision = newRev;
      const latest = snapshot();
      const latestKey = JSON.stringify(latest);
      if (latestKey === draftKey) {
        localDirty = false;
        requeueCount = 0;
        status('Mentés sikeres – rev ' + newRev);
        try { localStorage.removeItem('flotta_pending_v16'); } catch (e) {}
      } else {
        localDirty = true;
        status('Mentés folyamatban – újabb helyi módosítás várakozik');
      }
    } catch (e) {
      localDirty = true;
      if (e.message === 'REVISION_CONFLICT') {
        status('Ütközés: másik gépen módosították az adatot. Frissítsd az oldalt, vagy exportáld a helyi állapotot.', true);
      } else {
        console.error(e);
        status('Mentési hiba: ' + (e.message || e) + ' – helyi módosítás megőrizve', true);
      }
    } finally {
      writeInFlight = false;
      // If a newer edit arrived while we were writing, push the latest snapshot
      if (localDirty && isPrimary() && auth && auth.currentUser && requeueCount < MAX_REQUEUE) {
        requeueCount++;
        Promise.resolve().then(() => pushTransactional());
      } else if (requeueCount >= MAX_REQUEUE) {
        status('Túl sok újrapróbálkozás – exportáld a helyi állapotot és frissítsd az oldalt.', true);
        requeueCount = 0;
      }
    }
  }

  function gateOldSync() {
    // The integrated V1 browser must never fall back to legacy JSONP sync,
    // including before sign-in or on cached/expired sessions. The old central
    // export is obtained privately before cutover and the original deployed
    // Fleet remains untouched until that migration is approved.
    if (legacySyncGated) return;
    legacySyncGated = true;
    if (typeof window.pushRemote === 'function')
      window.pushRemote = function () {
        status('Régi Apps Script írás letiltva – csak ellenőrzött Firebase-átállás');
      };
    if (typeof window.pullRemote === 'function')
      window.pullRemote = function () {
        status('Régi Apps Script olvasás letiltva ezen az integrált V1 felületen');
      };
  }

  function patchSave() {
    if (savePatched || typeof save !== 'function') return;
    const originalSave = save;
    savePatched = true;
    window.save = function () {
      if (typeof fleetGateSession !== 'function' || !fleetGateSession()) return;
      // Pre-import: strictly read-only. Do not call original save or stage pending.
      if (!isPrimary()) {
        status('Import ellenőrzés előtt csak olvasás – mentés letiltva', true);
        return;
      }
      localDirty = true;
      originalSave.apply(this, arguments);
      if (auth && auth.currentUser) {
        pushTransactional();
      }
    };
  }

  async function verifyMember(uid) {
    // Server-only read. Retry once on transient emulator/network errors.
    // A missing or inactive profile is a hard failure, not a retry.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const userDoc = await db.doc('users/' + uid).get({ source: 'server' });
        const data = userDoc.exists ? userDoc.data() : null;
        if (!data) return false;
        return data.active === true && ['admin', 'editor'].includes(data.role);
      } catch (e) {
        if (attempt === 1) {
          console.error('verifyMember failed', e && e.code ? e.code : e);
          return false;
        }
        await new Promise(r => setTimeout(r, 150));
      }
    }
    return false;
  }

  function unlockUI() {
    sessionStorage.setItem('flotta_simple_session_v23', JSON.stringify({ user: 'imilemanagement', at: Date.now() }));
    if (typeof fleetGateDisplay === 'function') fleetGateDisplay();
  }

  function isAuthenticated() {
    return !!(memberVerified && auth && auth.currentUser && auth.currentUser.email === SHARED_EMAIL);
  }

  function patchSessionGate() {
    if (typeof fleetGateSession !== 'function') return;
    window.fleetGateSession = function () {
      // FAIL CLOSED: any legacy sessionStorage user (including forged
      // imilemanagement) is irrelevant without fresh SERVER-verified role.
      return isAuthenticated()
        ? { user: 'imilemanagement', at: Date.now() }
        : null;
    };
  }

  function patchLogin() {
    window.fleetSimpleLogin = async function (event) {
      event.preventDefault();
      const name = (document.getElementById('flottaUsername').value || '').trim().toLowerCase();
      const password = document.getElementById('flottaPassword').value;
      const error = document.getElementById('flottaLoginMessage');
      const button = document.getElementById('flottaLoginSubmit');
      if (name !== 'imilemanagement') {
        error.textContent = 'Csak a közös imilemanagement fiók használható.';
        return;
      }
      button.disabled = true;
      error.textContent = '';
      try {
        await initFirebase();
        const cred = await auth.signInWithEmailAndPassword(SHARED_EMAIL, password);
        const ok = await verifyMember(cred.user.uid);
        if (!ok) {
          await auth.signOut();
          throw new Error('Nincs érvényes admin/editor profil a users gyűjteményben.');
        }
        // Fresh server profile is mandatory even when Firebase Auth has a cached user.
        memberVerified = true;
        // Authentication only unlocks UI. Server-approved migration is a
        // separate prerequisite for remote writes and applying Fleet state.
        const approved = await verifyMigrationApproval();
        gateOldSync();
        patchSave();
        unlockUI();
        startListener();
        status(approved
          ? 'Bejelentkezve – migráció szerveroldalon jóváhagyva'
          : 'Bejelentkezve – írásvédett; jóváhagyott migráció még nincs');
        if (typeof load === 'function' && !window.flottaHasLoaded) {
          window.flottaHasLoaded = true;
          load();
        }
      } catch (err) {
        console.error(err);
        error.textContent = 'Bejelentkezés sikertelen. Ellenőrizd a jelszót és hogy a fiók (imilemanagement@imile-management-staging.firebaseapp.com) létezik és aktív profilja van.';
      } finally {
        button.disabled = false;
      }
    };

    window.fleetSimpleLogout = async function () {
      memberVerified = false;
      clearVerifiedMigration();
      if (auth) await auth.signOut();
      if (unsub) { unsub(); unsub = null; }
      setPrimary(false);
      localDirty = false;
      sessionStorage.removeItem('flotta_simple_session_v23');
      if (typeof fleetGateDisplay === 'function') fleetGateDisplay();
      status('Kijelentkezve');
    };
  }

  function resumeIfSession() {
    initFirebase().then(() => {
      auth.onAuthStateChanged(async (user) => {
        memberVerified = false;
        clearVerifiedMigration();
        if (typeof fleetGateDisplay === 'function') fleetGateDisplay();
        if (user && user.email === SHARED_EMAIL) {
          const ok = await verifyMember(user.uid);
          if (ok) {
            memberVerified = true;
            const approved = await verifyMigrationApproval();
            gateOldSync();
            patchSave();
            unlockUI();
            startListener();
            status(approved
              ? 'Munkamenet folytatva – migráció szerveroldalon jóváhagyva'
              : 'Munkamenet folytatva – írásvédett, migráció még nem jóváhagyott');
          } else {
            memberVerified = false;
            await auth.signOut();
            status('Érvénytelen profil – kijelentkeztetve', true);
          }
        } else {
          setPrimary(false);
          if (typeof fleetGateDisplay === 'function') fleetGateDisplay();
        }
      });
    }).catch(console.error);
  }

  function boot() {
    const tryPatch = () => {
      if (typeof fleetSimpleLogin === 'function' && typeof save === 'function') {
        patchLogin();
        patchSessionGate();
        gateOldSync();
        resumeIfSession();
      } else {
        setTimeout(tryPatch, 40);
      }
    };
    // Script loads after all original Fleet function definitions. Patch NOW,
    // before the subsequent inline legacy gate evaluates sessionStorage.
    // Waiting for DOMContentLoaded created a pre-Auth legacy unlock window.
    if (typeof fleetSimpleLogin === 'function' && typeof save === 'function') {
      tryPatch();
    } else if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', tryPatch);
    } else {
      tryPatch();
    }
  }

  window.flottaExportShared = function () {
    if (typeof snapshot !== 'function') return null;
    const data = snapshot();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'flotta-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    return data;
  };

  // Backward-compatible QA hook: request a fresh SERVER verification only.
  // The old constant token cannot authorize migration or a new Fleet import.
  window.flottaMarkImportVerified = async function () {
    await initFirebase();
    const approved = await verifyMigrationApproval();
    status(approved
      ? 'Szerveroldali migráció-jóváhagyás ellenőrizve'
      : 'Nincs jogosult szerveroldali migráció-jóváhagyás – írásvédelem aktív',
      !approved);
    return approved;
  };

  boot();
})();

```

## Original HTML snapshot and legacy sync excerpt – `525b058667ad4edc462c85109fd484b4edfe51ba`

```js
function snapshot() { return JSON.parse(JSON.stringify({vehicles,fuelCards,drivers,contacts})); }
    function applySnapshot(d) {
      vehicles=d.vehicles||[]; fuelCards=d.fuelCards||[]; drivers=d.drivers||[]; contacts=d.contacts||[];
      localStorage.setItem(STORAGE_KEY,JSON.stringify(snapshot())); refresh();
    }
    

function save() {
      if(!fleetGateSession())return;
      localStorage.setItem(STORAGE_KEY,JSON.stringify(snapshot()));
      dirty=true;localStorage.setItem(PENDING_KEY,JSON.stringify(snapshot()));
      statusMessage('Helyi mentés kész · központi mentés folyamatban…');
      if(pendingTimer) clearTimeout(pendingTimer);
      pendingTimer=setTimeout(pushRemote,350);
    }
    async function pushRemote() {
      if(!backendUrl){statusMessage('Csak helyi mentés – központi mentés nincs beállítva',true);return;}
      if(syncInProgress) {pendingTimer=setTimeout(pushRemote,1200);return;}
      syncInProgress=true;
      const draft=snapshot();
      const payload={action:'save',baseVersion:remoteVersion,requestId:'r'+Date.now()+'_'+Math.random().toString(36).slice(2),data:draft};
      try{
        // no-cors POST response is opaque; success is confirmed separately through JSONP readback.
        await fetch(backendUrl,{method:'POST',mode:'no-cors',headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify(payload)});
        let confirmed=false;
        for(let attempt=0;attempt<5;attempt++){
          await new Promise(r=>setTimeout(r,550+attempt*500));
          const check=await safeJsonp(backendUrl);
          if(check.ok && check.requestId===payload.requestId){
            confirmed=true;remoteVersion=Number(check.version);
            localStorage.setItem(VERSION_KEY,String(remoteVersion));
            // Another local edit may have occurred while this request was in flight.
            if(JSON.stringify(snapshot())===JSON.stringify(draft)){
              dirty=false;localStorage.removeItem(PENDING_KEY);
              statusMessage('Minden módosítás elmentve a központi adatbázisba ✓');
            }
            break;
          }
          if(check.ok && Number(check.version)>remoteVersion){
            statusMessage('Ütközés: más is módosította az adatokat. A helyi változat megmaradt; exportáld a JSON-t, majd egyeztesd az eltérést.',true);
            return;
          }
        }
        if(!confirmed) throw Error('A szerver nem igazolta a mentést.');
      }catch(err){statusMessage('A központi mentés nem sikerült; a helyi másolat megmaradt: '+err.message,true);}
      finally{
        syncInProgress=false;
        if(dirty && !localStorage.getItem(PENDING_KEY)) dirty=false;
      }
    }
    function init() {
      try{
        const saved=localStorage.getItem(STORAGE_KEY);
        const backup=localStorage.getItem(PENDING_KEY);
        if(!saved && !backup)remoteVersion=0;
        const d=backup?JSON.parse(backup):(saved?JSON.parse(saved):EMBEDDED_DATA);
        applySnapshot(d);
        dirty=Boolean(backup);
        if(dirty)statusMessage('Van nem szinkronizált helyi módosítás. A JSON exporttal mentsd el, mielőtt frissítenél.',true);
        else if(backendUrl)pullRemote();
        else statusMessage('Helyi működés · a központi kapcsolat beállításra vár',true);
      }catch(err){applySnapshot(EMBEDDED_DATA);statusMessage('Helyi visszaállítás szükséges: '+err.message,true);}
      setInterval(()=>{if(!dirty)pullRemote(true);},7000);
      window.addEventListener('focus',()=>{if(!dirty)pullRemote(true);});
    }
    function load(){init();}

    function uid() {
      return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    }

    function daysUntil(dateStr) {
      if (!dateStr) return null;
      const today = new Date();
      today.setHours(0,0,0,0);
      const d = new Date(dateStr);
      d.setHours(0,0,0,0);
      return Math.ceil((d - today) / (1000 * 60 * 60 * 24));
    }

    function dateBadge(dateStr) {
      const days = daysUntil(dateStr);
      if (days === null) return '<span class="badge">—</span>';
      if (days < 0) return `<span class="badge overdue">${t('overdue')} (${Math.abs(days)} ${t('daysAgo')})</span>`;
      if (days <= 30) return `<span class="badge soon">${days} ${t('days')}</span>`;
      return `<span class="badge ok-date">${days} ${t('days')}</span>`;
    }

    function statusLabel(s) {
      const map = {
        aktiv: t('statusAktiv'),
        hasznalatban: t('statusHasznalatban'),
        szerviz: t('statusSzerviz'),
        leallitott: t('statusLeallitott'),
        eladva: t('statusEladva'),
        inaktiv: t('statusInactive'),
        lezart: currentLang === 'en' ? 'Closed' : 'Lezárt'
      };
      return map[s] || s;
    }

    function renderStats() {
      const total = vehicles.length;
      const active = vehicles.filter(v => v.status === 'aktiv').length;
      const szerviz = vehicles.filter(v => v.status === 'szerviz').length;
      let overdue = 0;
      let soon = 0;
      vehicles.forEach(v => {
        ['biztositasLejarat','muszakiLejarat','cascoLejarat','berletiSzerzodesLejarat'].forEach(k => {
          const d =
```

## Depot app canonical accessor, planning + UI excerpt – `525b058667ad4edc462c85109fd484b4edfe51ba`

```js
const get=name=>['drivers','vehicles'].includes(name)
  ?(state.canonicalMaster?.trusted?state.canonicalMaster[name]:[])
  :(state.data[name]||[]);
const byId=(name,id)=>get(name).find(x=>x.id===id);


function nextDayPanel(){
 let forecast;try{forecast=prepareNextDay({
   baseDate:state.date,today:todayAtDepot(),
   demands:get('demands'),bookings:get('bookings'),
   drivers:get('drivers'),vehicles:get('vehicles'),
   sourcesReady:assessSources(state.sourceMeta,{online:navigator.onLine}).trusted
 });}catch{return section('Következő napi kapacitástervezés','<p class="notice">Érvénytelen tervezési dátum; előrejelzés nem adható.</p>');}
 const statuses={
   unavailable:'Az adatforrások nem érhetők el teljesen – előrejelzés nem adható.',
   incomplete:'Hiányzó vagy ütköző kerületi csomagigény – a terv még nem teljes.',
   shortage:'Tervezett kapacitáshiány legalább egy kerületben.',
   needs_confirmation:'A tervezett kapacitás megvan, de visszaigazolás vagy ellenőrzés szükséges.',
   ready:'A rögzített, visszaigazolt kapacitás minden ismert kerületben elegendő.'
 };
 const health=assessSources(state.sourceMeta,{online:navigator.onLine});
 const format=n=>n===null?'—':fmt(n);
 const gap=n=>n===null?'Ismeretlen':
   label((n>=0?'+':'')+fmt(n),n<0?'red':'green');
 const rows=forecast.rows.map(x=>td(
   esc(x.district),format(x.newCount),format(x.retryCount),format(x.demand),
   format(x.plannedCapacity),format(x.confirmedCapacity),
   gap(x.plannedGap),gap(x.confirmedGap)
 ));
 const warnings=[
   forecast.invalidBookingCount?'Ütköző vagy hibás foglalások: '+forecast.invalidBookingCount+' db.':'',
   forecast.pendingCount?'Visszaigazolásra váró érvényes foglalások: '+forecast.pendingCount+' db.':'',
   forecast.missingDemandDistricts.length?'Hiányzó kerületi igény: '+forecast.missingDemandDistricts.join(', ')+'.':'',
   forecast.issues.length?'Adatütközések/ellenőrzendő sorok: '+forecast.issues.length+' db.':''
 ].filter(Boolean);
 return '<div id="nextDayForecast">'+section('Következő napi kapacitástervezés · '+esc(forecast.date),
   '<p class="inline-note">Tervezett = minden érvényes foglalás; visszaigazolt = csak a megerősített, ütközésmentes futár–autó párok. Nem adjuk össze ugyanazt a futárt kétszer. A csomagadatok még aggregált adatok; a csomagszintű átfedés nem bizonyított.</p>'+
   '<p class="notice" data-forecast-status="'+forecast.status+'">'+esc(statuses[forecast.status])+' '+esc(health.message)+(warnings.length?' '+esc(warnings.join(' ')):'')+'</p>'+
   '<div class="grid kpis">'+
   kpi('Következő napi igény',forecast.totalDemand,'Új és ismételt kézbesítések együtt')+
   kpi('Tervezett kapacitás',forecast.plannedCapacity,'Érvényes beosztásból')+
   kpi('Visszaigazolt kapacitás',forecast.confirmedCapacity,'Megerősített futár–autó párokból')+
   kpi('Megerősített eltérés',forecast.confirmedGap,'Negatív = még nem fedezett csomag',forecast.confirme

function planning(){const ds=get('drivers').filter(eligibleDriver).slice().sort((a,b)=>a.name.localeCompare(b.name));const vs=get('vehicles').filter(x=>x.status==='Elérhető').slice().sort((a,b)=>a.plate.localeCompare(b.plate));const today=get('bookings').filter(x=>x.date===state.date).sort((a,b)=>(a.district||'').localeCompare(b.district||''));const taken=new Set(today.map(x=>x.vehicleId));const available=vs.filter(x=>!taken.has(x.id));const form=canWrite()?section('Futár és autó összerendelése',frm('booking',field('date','Munkanap','date',state.date)+select('driverId','Futár',ds,x=>x.name+' · '+x.daCode)+select('vehicleId','Szabad autó',available,x=>x.plate)+field('district','Kerület','text','','placeholder="pl. IX."')+'<label>Státusz<select name="status"><option value="planned">Tervezett</option><option value="confirmed">Visszaigazolt</option></select></label>','Foglalás mentése')+'<p class="small">Egy autó egy nap csak egy futárhoz foglalható. Ugyanaz a futár sem kaphat két autót ugyanarra a napra.</p>'):'';
return datebar()+nextDayPanel()+centralTaskList(5)+attendanceVehicleSummary()+form+section('Napi foglalások · '+today.length,table(['Futár','Autó','Kerület','Kapacitás','Státusz','Elérhetőség',''],today.map(x=>td(esc(byId('drivers',x.driverId)?.name||'Ismeretlen'),esc(byId('vehicles',x.vehicleId)?.plate||'—'),esc(x.district),fmt(x.capacity),status(x.status),bookingAssessment(x).eligible?label('Rendben','green'):label('Nem elérhető','red'),canWrite()?'<button class="danger" data-cancel="'+esc(x.id)+'">Feloldás</button>':''))));}


function refreshCanonicalMaster(){
 state.canonicalMaster=assessCanonicalMasterDisplay({
  fleet:state.canonicalFleetRaw,
  approval:state.canonicalApproval,
  uid:state.uid,driverMirrors:state.data.drivers,
  vehicleMirrors:state.data.vehicles,sourceMeta:state.sourceMeta,
  online:navigator.onLine
 });
 return state.canonicalMaster;
}
function updateLiveIndicator(){
 if($('shell').hidden)return;
 const health=assessSources(state.sourceMeta,{
  online:navigator.onLine,required:liveSources
 });
 const canonical=refreshCanonicalMaster();
 const label=liveIndicatorPresentation(health);
 const trusted=label.trusted&&canonical.trusted;
 $('liveIndicator').textContent=trusted
  ?'● Élő Flotta–Depó kapcsolat · kanonikus törzs egyezik'
  :canonical.trusted?label.text:'● Flotta–Depó törzs zárolva · '+canonical.reason;
 $('liveIndicator').classList.toggle('off',!trusted);
 $('dataStamp').textContent=trusted&&health.confirmedAt
  ?'Minden kanonikus forrás visszaigazolva: '+new Date(health.confirmedAt).toLocaleTimeString('hu-HU')
  :'Hiányzó migrációs jóváhagyás vagy nem egyező törzsadat: foglalás nem hitelesíthető';
}


const unsubFleet=onSnapshot(doc(db,'flottaSharedState','current'),{includeMetadataChanges:true},snap=>{
   const exists=snap.exists(),meta=snap.metadata;
   const confirmed=exists&&!meta.fromCache&&!meta.hasPendingWrites;
   state.sourceMeta.flottaSharedState={
    loaded:exists,fromCache:meta.fromCache,pending:meta.hasPendingWrites,
    error:!exists,
    serverAt:confirmed?Date.now():state.sourceMeta.flottaSharedState?.serverAt
   };
   if(exists)state.errors.delete('flottaSharedState');
   else state.errors.add('flottaSharedState');
   state.sharedFleet=projectSharedFleetSnapshot(exists?snap.data():null,meta);
   state.canonicalFleetRaw=confirmed&&exists?snap.data():null;
   updateLiveIndicator();
   render();
 },err=>{
   console.error('flottaSharedState/current',err);
   state.errors.add('flottaSharedState');
   state.sourceMeta.flottaSharedState={...state.sourceMeta.flottaSharedState,loaded:false,error:true};
   state.sharedFleet={...emptySharedFleetPreview(),status:'unavailable',note:'A Flotta közös dokumentum nem olvasható. Nem történt adatátvitel.'};
   state.canonicalFleetRaw=null;
   updateLiveIndicator();
   render();
 });
 state.unsubscribe.push(unsubFleet);
 // Privileged migration approval is browser-immutable in the V1 Rules.
 // A cached, pending, missing, revoked or mismatched source closes every
 // canonical master list rather than presenting stale Depot-only records.
 const unsubApproval=onSnapshot(doc(db,'flottaMigrationApproval','current'),{includeMetadataChanges:true},snap=>{
   const exists=snap.exists(),meta=snap.metadata;
   const confirmed=exists&&!meta.fromCache&&!meta.hasPendingWrites;
   state.canonicalApproval=confirmed&&exists?snap.data():null;
   state.sourceMeta.flottaMigrationApproval={
     loaded:exists,fromCache:meta.fromCache,pending:meta.hasPendingWrites,
     error:!exists,
     serverAt:confirmed?Date.now():state.sourceMeta.flottaMigrationApproval?.serverAt
   };
   if(exists)state.errors.delete('flottaMigrationApproval');
   else state.errors.add('flottaMigrationApproval');
   updateLiveIndicator();render();
 },err=>{
   console.error('flottaMigrationApproval/current',err);
   state.canonicalApproval=null;
   state.errors.add('flottaMigrationApproval');
   state.sourceMeta.flottaMigrationApproval={
     ...state.sourceMeta.flottaMigrationApproval,loaded:false,error:true
   };
   updateLiveIndicator();render();
 });
 state.unsubscribe.push(unsubApproval);
}


async function saveForm(type,values){if(!canWrite()&&type!=='user')throw Error('Csak belső szerkesztő módosíthat.');let col,id,obj;
if(type==='driver'){throw Error('A futártörzs a Flotta kezelésében van. A közös rekordokat a Kapacitáskezelőben nem módosítjuk.');col='drivers';id=(values.daCode||'').trim().toUpperCase();if(!id)throw Error('Hiányzó DA-kód.');obj={name:values.name.trim(),daCode:id,vendor:values.vendor.trim(),capacity:number(values.capacity),active:true};}
else if(type==='vehicle'){throw Error('Az autótörzs a Flotta kezelésében van. A közös rekordokat a Kapacitáskezelőben nem módosítjuk.');col='vehicles';id=values.plate.replace(/[\s-]/g,'').toUpperCase();if(!id)throw Error('Hiányzó rendszám.');obj={plate:id,model:values.model.trim(),status:values.status};}
else if(type==='capacity'){col='driverCapacities';id=values.driverId;if(!byId('drivers',id))throw Error('A futár nem található a közös törzsben.');obj={capacity:number(values.capacity)};if(obj.capacity>10000)throw Error('Túl nagy kapacitásérték.');}
else if(type==='demand'){col='demands';const date=iso(values.date),district=values.district.trim().toUpperCase().replaceAll('/','-');id=date+'__'+district;obj={date,district,newCount:number(values.newCount),retryCount:number(values.retryCount)};}
else if(type==='result'){col='results';const picked=number(values.picked),success=number(values.success),failed=number(values.failed);if(success+failed>picked)throw Error('A sikeres és sikertelen összeg nem lehet több a felvett csomagszámnál.');const date=iso(values.date),district=values.district.trim().toUpperCase().replaceAll('/','-');id=date+'__'+values.driverId+'__'+district;obj={date,driverId:values.driverId,district,picked,success,failed};}
else if(type==='user'){throw Error('V1-ben kizárólag a meglévő közös iMile-fiók használható; felhasználók itt nem szerkeszthetők.');}
else if(type==='booking'){
  const date=iso(values.date),driverId=values.driverId,vehicleId=values.vehicleId;
  await commitCanonicalDepotBooking({
    db,sdk:{doc,runTransaction},uid:state.uid,
    getCurrentUid:()=>auth.currentUser?.uid,
    offline:!navigator.onLine,
    booking:{
      date,driverId,vehicleId,
      district:String(values.district||'').trim().toUpperCase(),
      status:values.status
    }
  });
  // Only after the actual Firestore transaction has returned success.
  toast('Foglalás szerveroldalon visszaigazolva.');return;
}
else throw Error('Ismeretlen művelet.');
await setDoc(doc(db,col,id),obj,{merge:true});toast('Mentés sikeres.');}
async function removeRow(col,id){if(!canWrite())throw Error('Nincs jogosultság.');if(!confirm('Biztosan törlöd a kiválasztott rekordot?'))return;if(col==='bookings')return;await deleteDoc(doc(db,col,id));toast('Törölve.');}
async function cancelBooking(id){const ref=doc(db,'bookings',id);await runTransaction(db,async tx=>{const booking=await tx.get(ref);if(!booking.exists())throw Error('A foglalás már nem található.');const x=booking.data();tx.delete(ref);tx.delete(doc(db,'driverClaims',x.date+'__'+x.driverId));});toast('Foglalás feloldva.');}
const lookup=(obj,...names)=>{const normalize=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/gi,'').toLowerCase();const entries=Object.entries(obj);for(const n of names){const f=entries.find(([k])=>normalize(k)===normalize(n));if(f)return f[1];}return '';};
function keyed(s){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return 'r'+(h>>>0).toString(36)+'_'+s.length;}
async function parseFile(file,type){if(!window.XLSX)throw Error('Az Excel-feldolgozó nem töltődött be. Ellenőrizd az internetkapcsolatot.');const buffer=await file.arrayBuffer();const csv=/\.csv$/i.test(file.name);const wb=csv?XLSX.read(decodeCsv(buffer),{type:'string',raw:true,cellDates:false}):XLSX.read(buffer,{type:'array',cellDates:false});const target=type==='attendance'&&(wb.SheetNames.find(x=>x.toLowerCase().includes('mobile attendance')))||wb.SheetNames[0];const json=XLSX.utils.sheet_to_json(wb.Sheets[target],{defval:'',raw:false});if(json.length>5000)throw Error('Legfeljebb 5000 sor tölthető fel egyszerre.');return {rows:json,sheet:target};}
function requireValue(value,label){
 const v=String(value??'').trim();
 if(!v)throw Error('Hiányzik: '+label);
 if(v.length>100)throw Error('Túl hosszú mező: '+label);
 return v;
}
function rowToRecord(row,type,file){
 if(type==='demand'){
  const date=parseDay(lookup(row,'date','dátum','nap','work date'));
  const district=requireValue(lookup(row,'district','kerület','area','zipcode'),'kerület').toUpperCase().replaceAll('/','-');
  if(!date)throw Error('Hiányzó vagy hibás dátum.');
  const newCount=readNonNegativeCount(lookup(row,'new','newcount','új csomag','új','new packages'),'Új csomag');
  const retryCount=readNonNegativeCount(lookup(row,'retry','retrycount','visszatérő','újrakézbesítendő','failed returns'),'Újrakézbesítendő');
  return {col:'demands',id:date+'__'+district,data:{date,district,newCo
```

## COMPLETE `depokapacitas/canonical-booking-transaction.mjs` – `525b058667ad4edc462c85109fd484b4edfe51ba`

```js
/**
 * REAL Firestore transaction adapter for a single Depot booking.
 *
 * Receives the Firebase SDK's {doc,runTransaction} from the authenticated app.
 * Node unit tests inject the same real SDK bound to the LOCAL emulator.
 * NO Firebase config, deploy, UID, credentials or network access in module.
 *
 * IMPORTANT: Transactions are atomic only for the documents THEY touch.
 * This checks the selected driver/vehicle, but does not solve all V1 Fleet
 * <-> Depot canonical master synchronization. Overall release is NO-GO.
 */
import {assessCanonicalBookingMaster} from './canonical-booking-gate.mjs';

const idPattern=/^[A-Z0-9_-]{4,40}$/;
const platePattern=/^[A-Z0-9]{4,12}$/;
const datePattern=/^\d{4}-\d{2}-\d{2}$/;

export async function commitCanonicalDepotBooking({
  db,sdk,uid,getCurrentUid,offline,booking
}={}){
  if(offline!==false)throw Error('BOOKING_BLOCKED: offline_or_unverified_network');
  if(!uid||typeof getCurrentUid!=='function'||getCurrentUid()!==uid)
    throw Error('BOOKING_BLOCKED: session_changed');
  if(!sdk||typeof sdk.doc!=='function'||typeof sdk.runTransaction!=='function')
    throw Error('BOOKING_BLOCKED: invalid_firestore_sdk');
  if(!booking||!datePattern.test(booking.date||'')||
     !idPattern.test(booking.driverId||'')||
     !platePattern.test(booking.vehicleId||'')||
     !['planned','confirmed'].includes(booking.status)||
     typeof booking.district!=='string'||booking.district.length>60)
    throw Error('BOOKING_BLOCKED: invalid_booking_fields');
  const {date,driverId,vehicleId,district,status}=booking;
  const bookingId=date+'__'+vehicleId,driverKey=date+'__'+driverId;
  const refs={
    booking:sdk.doc(db,'bookings',bookingId),
    driverClaim:sdk.doc(db,'driverClaims',driverKey),
    driver:sdk.doc(db,'drivers',driverId),
    vehicle:sdk.doc(db,'vehicles',vehicleId),
    capacity:sdk.doc(db,'driverCapacities',driverId),
    fleet:sdk.doc(db,'flottaSharedState','current'),
    approval:sdk.doc(db,'flottaMigrationApproval','current')
  };
  // The function may RETRY on concurrent change, so DO NOT mutate UI or
  // localStorage inside it. No success signal until runTransaction resolves.
  const confirmation=await sdk.runTransaction(db,async tx=>{
    if(getCurrentUid()!==uid)throw Error('BOOKING_BLOCKED: session_changed');
    const [oldBook,oldClaim,driver,vehicle,capacity,fleet,approval]=await Promise.all([
      tx.get(refs.booking),tx.get(refs.driverClaim),
      tx.get(refs.driver),tx.get(refs.vehicle),tx.get(refs.capacity),
      tx.get(refs.fleet),tx.get(refs.approval)
    ]);
    if(oldBook.exists()||oldClaim.exists())
      throw Error('BOOKING_BLOCKED: already_occupied');
    const check=assessCanonicalBookingMaster({
      fleet:fleet.exists()?fleet.data():null,
      approval:approval.exists()?approval.data():null,
      uid:getCurrentUid()===uid?uid:null,
      driverId,vehicleId,
      depotDriver:driver.exists()?{id:driverId,...driver.data()}:null,
      depotVehicle:vehicle.exists()?{id:vehicleId,...vehicle.data()}:null
    });
    if(!check.ready)throw Error('BOOKING_BLOCKED: '+check.code);
    const rawCapacity=capacity.exists()?capacity.data()?.capacity:driver.data()?.capacity;
    if(!Number.isSafeInteger(rawCapacity)||rawCapacity<0||rawCapacity>10000)
      throw Error('BOOKING_BLOCKED: invalid_capacity');
    if(getCurrentUid()!==uid)throw Error('BOOKING_BLOCKED: session_changed');
    tx.set(refs.booking,{date,driverId,vehicleId,district,status,capacity:rawCapacity});
    tx.set(refs.driverClaim,{date,driverId,bookingId});
    return {bookingId,driverKey,fleetRevision:check.fleetRevision};
  });
  // Firestore SDK resolves the transaction only after atomic server success.
  // Returning this does NOT imply the wider Fleet+Depot migration has GO.
  return {committed:true,...confirmation};
}

```

## COMPLETE `depokapacitas/canonical-booking-gate.mjs` – `525b058667ad4edc462c85109fd484b4edfe51ba`

```js
/**
 * Fail-closed V1 original Fleet -> Depot booking master parity check.
 *
 * PURE: no network, Firebase or state modifications. A caller must supply
 * fresh server documents obtained INSIDE its booking Firestore transaction.
 * Never trust separately mirrored /drivers and /vehicles merely by ID.
 *
 * This protects the *selected* booking master references only, not the
 * entire Fleet/Depot cutover. The latter remains an independently gated GO.
 */
import {planSharedMigration} from '../features/shared-master-adapter.mjs';

const SHA=/^[a-f0-9]{64}$/;
const strictEquals=(received,expected)=>{
  if(!received||!expected||typeof received!=='object'||Array.isArray(received))
    return false;
  const keys=Object.keys(expected);
  return Object.keys(received).length===keys.length &&
    keys.every(k=>Object.prototype.hasOwnProperty.call(received,k)&&
      Object.is(received[k],expected[k]));
};
const blocked=(code)=>({ready:false,code});

export function assessCanonicalBookingMaster({
  fleet,approval,uid,driverId,vehicleId,depotDriver,depotVehicle,
  expectedFleetRevision
}={}){
  if(!uid||!SHA.test(approval?.sourceSha256||'')||
      approval?.status!=='approved'||approval?.approvedUid!==uid)
    return blocked('no_server_migration_approval');
  // These are the metadata written by a later, privileged, proven import.
  // A syntactically valid SHA in a policy alone is NOT proof of a restored
  // Fleet source; the document must carry that exact immutable source id.
  if(!fleet||!Number.isSafeInteger(fleet.revision)||fleet.revision<1||
     fleet.migrationSourceSha256!==approval.sourceSha256)
    return blocked('fleet_source_not_attested');
  if(expectedFleetRevision!==undefined&&
     fleet.revision!==expectedFleetRevision)
    return blocked('fleet_revision_changed');
  let plan;
  try{plan=planSharedMigration(fleet);}
  catch(_){return blocked('invalid_full_fleet_snapshot');}
  if(!plan.ready||plan.writes.drivers.some(w=>!w)||
      plan.writes.vehicles.some(w=>!w))
    return blocked('invalid_canonical_master_projection');

  const driver=plan.writes.drivers.find(x=>x.id===driverId);
  const vehicle=plan.writes.vehicles.find(x=>x.id===vehicleId);
  if(!driver||!vehicle)return blocked('booking_master_not_in_original_fleet');
  if(!depotDriver||depotDriver.id!==driverId||
     !strictEquals(Object.fromEntries(
       Object.entries(depotDriver).filter(([k])=>k!=='id')),driver.data))
    return blocked('driver_depot_projection_drift');
  if(!depotVehicle||depotVehicle.id!==vehicleId||
     !strictEquals(Object.fromEntries(
       Object.entries(depotVehicle).filter(([k])=>k!=='id')),vehicle.data))
    return blocked('vehicle_depot_projection_drift');
  if(driver.data.active!==true||vehicle.data.status!=='Elérhető')
    return blocked('ineligible_fleet_master');

  return {
    ready:true,code:'server_read_parity_ready',
    fleetRevision:fleet.revision,driverId,vehicleId,
    notice:'PARITY ONLY. The caller must complete a real Firestore transaction; no booking has been saved by this function.'
  };
}

```

## COMPLETE `depokapacitas/canonical-source-health.mjs` – `525b058667ad4edc462c85109fd484b4edfe51ba`

```js
/**
 * S7 SINGLE-SOURCE Depot master list from the complete ORIGINAL Fleet.
 *
 * Depot /drivers and /vehicles are treated as verification-only mirrors:
 * never as an independent source of available drivers/cars. Only a fully
 * server-confirmed migration approval AND a complete matching Fleet state
 * permits presentation as available operational master data.
 *
 * Pure, no Firebase, writes, browser APIs, private sidecar in output.
 * This is NOT proof of an approved real migration or deploy.
 */
import {planSharedMigration} from '../features/shared-master-adapter.mjs';
import {planCanonicalMasterTransition} from '../features/fleet-depo-canonical-transition.mjs';

const SOURCE_IDS=['drivers','vehicles','flottaSharedState','flottaMigrationApproval'];
const SHA=/^[a-f0-9]{64}$/;
const blocked=(reason,issues=[])=>({
  trusted:false,status:'blocked',reason,issues,
  drivers:[],vehicles:[],revision:null,
  source:'original-fleet-only',liveVerified:false
});

export function assessCanonicalMasterDisplay({
  fleet,approval,uid,driverMirrors,vehicleMirrors,sourceMeta,
  online=true,now=Date.now(),maxAgeMs=15*60_000
}={}){
  if(online!==true)return blocked('offline');
  if(!uid||!approval||approval.status!=='approved'||
     approval.approvedUid!==uid||!SHA.test(approval.sourceSha256||''))
    return blocked('unapproved_migration');
  if(!fleet||!Number.isSafeInteger(fleet.revision)||fleet.revision<1||
     fleet.migrationSourceSha256!==approval.sourceSha256)
    return blocked('original_fleet_source_not_attested');

  for(const name of SOURCE_IDS){
    const meta=sourceMeta?.[name];
    if(!meta||meta.loaded!==true||meta.error===true||
       meta.fromCache!==false||meta.pending!==false||
       !Number.isFinite(meta.serverAt)||meta.serverAt<=0||
       meta.serverAt>now||now-meta.serverAt>maxAgeMs)
      return blocked('unconfirmed_or_stale_source_'+name);
  }

  const plan=planCanonicalMasterTransition({
    previousFleet:fleet,nextFleet:fleet,
    liveDrivers:driverMirrors,liveVehicles:vehicleMirrors,bookings:[]
  });
  if(!plan.ready)return blocked('depot_mirror_drift',
    (plan.issues||[]).slice(0,10).map(i=>({kind:i.kind,reason:i.reason})));
  let projected;
  try{projected=planSharedMigration(fleet);}
  catch(_){return blocked('invalid_original_fleet_structure');}
  if(!projected.ready||
     projected.writes.drivers.some(x=>!x)||
     projected.writes.vehicles.some(x=>!x))
    return blocked('invalid_original_fleet_master');

  // Drop ALL rich original Fleet sidecars: lists contain strict fields only.
  const drivers=projected.writes.drivers.map(x=>({id:x.id,...x.data}));
  const vehicles=projected.writes.vehicles.map(x=>({id:x.id,...x.data}));
  return {
    trusted:true,status:'ready',reason:null,issues:[],
    drivers,vehicles,revision:fleet.revision,
    source:'original-fleet-only',
    liveVerified:false,
    notice:'Server-confirmed synthetic/client parity; requires separately authorized live migration and immutable Rules before GO'
  };
}

```

## COMPLETE `features/shared-master-adapter.mjs` – `525b058667ad4edc462c85109fd484b4edfe51ba`

```js
/**
 * Safe, read-only projection from ORIGINAL Flotta to Depo master records.
 * Full original records (including history) stay in the private migration plan.
 * Never put the rich flotta sidecar inside strict /vehicles or /drivers writes.
 * No network calls, no Firebase writes, no cutover.
 */
const clone=x=>JSON.parse(JSON.stringify(x));
const str=x=>typeof x==='string'?x.trim():'';
const plate=x=>str(x).replace(/[\s-]/g,'').toUpperCase();
const code=x=>str(x).toUpperCase();
const plateOK=x=>/^[A-Z0-9]{4,12}$/.test(x);
const codeOK=x=>/^[A-Z0-9_-]{4,40}$/.test(x);
const statuses=Object.freeze(['Elérhető','Szerviz','Leállított']);
const vehicleStatus=s=>{
  const x=str(s).toLowerCase();
  if(['aktiv','aktív'].includes(x))return 'Elérhető';
  if(x==='szerviz')return 'Szerviz';
  return 'Leállított'; // fail-safe, never infer available from unknown status
};
const driverActive=s=>['aktiv','aktív'].includes(str(s).toLowerCase());
const capacityOf=d=>{
  const raw=d.kapacitas??d.capacity??0;
  if(typeof raw==='string'&&!raw.trim())return 0;
  const n=Number(raw);
  return Number.isSafeInteger(n)&&n>=0&&n<=10000?n:null;
};

export function fleetVehicleToDepo(v) {
  if(!v||typeof v!=='object'||Array.isArray(v))return null;
  const p=plate(v.rendszam),model=[str(v.gyartmany),str(v.modell)].filter(Boolean).join(' ');
  if(!plateOK(p)||model.length>160)return null;
  return {id:p,plate:p,model,status:vehicleStatus(v.status),flotta:clone(v)};
}
export function fleetDriverToDepo(d) {
  if(!d||typeof d!=='object'||Array.isArray(d))return null;
  // Original Flotta id is an internal generated ID, NOT the business DA code.
  const daCode=code(d.daCode),name=str(d.name||d.nev);
  const vendor=str(d.agency||d.vendor||d.vallalkozo),capacity=capacityOf(d);
  if(!codeOK(daCode)||!name||name.length>160||vendor.length>160||capacity===null)return null;
  return {id:daCode,daCode,name,vendor,capacity,active:driverActive(d.status),flotta:clone(d)};
}
export function depoVehicleWrite(v) {
  if(!v||v.id!==v.plate||!plateOK(str(v.plate))||
     typeof v.model!=='string'||v.model.length>160||!statuses.includes(v.status))return null;
  return {id:v.id,data:{plate:v.plate,model:v.model,status:v.status}};
}
export function depoDriverWrite(d) {
  if(!d||d.id!==d.daCode||!codeOK(str(d.daCode))||
     typeof d.name!=='string'||!d.name.trim()||d.name.length>160||
     typeof d.vendor!=='string'||d.vendor.length>160||
     !Number.isSafeInteger(d.capacity)||d.capacity<0||d.capacity>10000||
     typeof d.active!=='boolean')return null;
  return {id:d.id,data:{name:d.name,daCode:d.daCode,vendor:d.vendor,capacity:d.capacity,active:d.active}};
}
// Reduced Depo records are NEVER safe to restore over full original Flotta.
export const depoToFleetVehicle=doc=>doc?.flotta?clone(doc.flotta):null;
export const depoToFleetDriver=doc=>doc?.flotta?clone(doc.flotta):null;

export function planSharedMigration(snapshot) {
  if(!snapshot||typeof snapshot!=='object'||Array.isArray(snapshot)||
     !['vehicles','drivers','fuelCards','contacts'].every(k=>Array.isArray(snapshot[k])))
    throw Error('Incomplete original Flotta snapshot (four arrays required)');
  const issues=[],vehicles=[],drivers=[],vWrites=[],dWrites=[];
  const seenV=new Set(),seenD=new Set();
  snapshot.vehicles.forEach((raw,index)=>{
    const v=fleetVehicleToDepo(raw);
    if(!v){issues.push({kind:'vehicle',index,reason:'invalid/missing plate or model'});return;}
    if(seenV.has(v.id)){issues.push({kind:'vehicle',index,reason:'duplicate normalized plate',id:v.id});return;}
    seenV.add(v.id);
    if(!['aktiv','aktív','szerviz','leállított','leallitott'].includes(str(raw.status).toLowerCase()))
      issues.push({kind:'vehicle',index,reason:'unknown source status',id:v.id});
    vehicles.push(v);vWrites.push(depoVehicleWrite(v));
  });
  snapshot.drivers.forEach((raw,index)=>{
    const d=fleetDriverToDepo(raw);
    if(!d){issues.push({kind:'driver',index,reason:'missing/invalid DA code, name, vendor or capacity'});return;}
    if(seenD.has(d.id)){issues.push({kind:'driver',index,reason:'duplicate normalized DA code',id:d.id});return;}
    seenD.add(d.id);
    if(!['aktiv','aktív','inaktiv','inaktív'].includes(str(raw.status).toLowerCase()))
      issues.push({kind:'driver',index,reason:'unverified source status',id:d.id});
    drivers.push(d);dWrites.push(depoDriverWrite(d));
  });
  const source=clone(snapshot);
  return {
    ready:issues.length===0&&vehicles.length===snapshot.vehicles.length&&drivers.length===snapshot.drivers.length,
    issues,vehicles,drivers,writes:{vehicles:vWrites,drivers:dWrites},source,
    preservedVehicleFields:vehicles.every(v=>!!v.flotta?.rendszam),
    preservedDriverFields:drivers.every(d=>!!d.flotta?.id),
    counts:{
      vehicles:vehicles.length,drivers:drivers.length,
      fuelCards:snapshot.fuelCards.length,contacts:snapshot.contacts.length,
      vehicleHistory:snapshot.vehicles.reduce((n,v)=>n+(Array.isArray(v?.history)?v.history.length:0),0),
      driverHistory:snapshot.drivers.reduce((n,v)=>n+(Array.isArray(v?.history)?v.history.length:0),0)
    }
  };
}

```

## COMPLETE `features/fleet-backup-parity.mjs` – `525b058667ad4edc462c85109fd484b4edfe51ba`

```js
/**
 * Offline, read-only original Fleet backup/restore parity audit.
 *
 * IMPORTANT: This does NOT export, access, import or migrate real data.
 * It compares the exact four-array result of the ORIGINAL index.html
 * snapshot() to the same four-array state from a proposed restored document.
 * The SHA-256 domain is EXPLICITLY four arrays only, without Firestore revision
 * or updatedAt/By metadata. Requires separate authorized server-side cutover.
 */
import {createHash} from 'node:crypto';
import {analyze,canonical} from './migration-size-probe.mjs';

export const FLEET_ARRAY_KEYS=Object.freeze([
  'vehicles','fuelCards','drivers','contacts'
]);
const RESTORED_METADATA=Object.freeze(['revision','updatedAt','updatedBy']);
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&
  (Object.getPrototypeOf(x)===Object.prototype||Object.getPrototypeOf(x)===null);
const sha=x=>createHash('sha256').update(canonical(x),'utf8').digest('hex');

function extract(input,{restored=false}={},reasons){
  if(!plain(input)){
    reasons.push(restored?'invalid_restored_document':'invalid_original_backup');
    return null;
  }
  const allowed=restored?[...FLEET_ARRAY_KEYS,...RESTORED_METADATA]:FLEET_ARRAY_KEYS;
  if(Object.keys(input).some(k=>!allowed.includes(k)))
    reasons.push(restored?'unexpected_restored_field':'unexpected_original_field');
  const payload={};
  for(const key of FLEET_ARRAY_KEYS){
    if(!Array.isArray(input[key]))reasons.push('missing_or_invalid_'+key);
    else payload[key]=input[key];
  }
  if(restored && (!Number.isSafeInteger(input.revision)||input.revision<1))
    reasons.push('missing_or_invalid_import_revision');
  return Object.keys(payload).length===FLEET_ARRAY_KEYS.length?payload:null;
}

export function auditOriginalFleetRestore(originalBackup,proposedRestoredDocument,options={}){
  const reasons=[];
  const original=extract(originalBackup,{},reasons);
  const restored=extract(proposedRestoredDocument,{restored:true},reasons);
  let sourceSha256=null,restoredSha256=null,estimatedBytes=null;
  let sourceCount=null,restoredCount=null;
  if(original&&restored){
    try{
      sourceSha256=sha(original);
      restoredSha256=sha(restored);
      sourceCount=Object.fromEntries(FLEET_ARRAY_KEYS.map(k=>[k,original[k].length]));
      restoredCount=Object.fromEntries(FLEET_ARRAY_KEYS.map(k=>[k,restored[k].length]));
      if(sourceSha256!==restoredSha256)reasons.push('backup_restore_payload_mismatch');
      if(options.approvedSourceSha256!==undefined &&
         (typeof options.approvedSourceSha256!=='string' ||
         !/^[a-f0-9]{64}$/.test(options.approvedSourceSha256) ||
         options.approvedSourceSha256!==sourceSha256))
        reasons.push('approval_source_hash_mismatch');
      const analysis=analyze({
        ...restored,revision:proposedRestoredDocument.revision
      });
      estimatedBytes=analysis.firestoreDocumentBytes;
      if(analysis.stop)reasons.push('native_document_size_or_schema_stop');
    }catch(error){
      reasons.push('noncanonical_or_invalid_nested_source');
    }
  }
  return {
    status:reasons.length?'BLOCKED':'PARITY_MATCHED_OFFLINE',
    reasons,
    payloadSha256:sourceSha256,
    restoredPayloadSha256:restoredSha256,
    counts:sourceCount,restoredCounts:restoredCount,
    estimatedFirestoreDocumentBytes:estimatedBytes,
    // This is a PARITY CHECK, not a private backup, recovery test or approval.
    sourceBackupObtained:false,
    restoreToLiveVerified:false,
    serverApprovalVerified:false,
    ownerAuthorized:false,
    deployAuthorized:false,
    notice:'Only offline JSON four-array parity; requires private real backup, actual restore drill, SHA approval, and live Rules before GO'
  };
}

```

## COMPLETE `features/migration-size-probe.mjs` – `525b058667ad4edc462c85109fd484b4edfe51ba`

```js
/**
 * Offline, read-only preflight for the legacy Fleet ONE-document snapshot.
 * Does NOT access Firebase, publish Rules, migrate data or prove live deploy.
 *
 * Document size estimation follows Firestore Native-mode storage-size rules:
 * https://firebase.google.com/docs/firestore/storage-size
 * Map values cost their nested field-name/value sizes PLUS 32 bytes; number
 * values cost 8 bytes; strings and field names are UTF-8 bytes PLUS 1.
 * The estimator applies to JSON-compatible values only. Firestore typed
 * values (Timestamp/GeoPoint/Bytes/Reference) need separate live verification.
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const LIMIT = 1_048_576;
const SAFE_DOCUMENT_LIMIT = LIMIT - 4; // Firestore REST document limit.
const WARN = 900 * 1024;
const MAX_VALUE = LIMIT - 89;
const DOCUMENT = 'flottaSharedState/current';
const utf8 = value => Buffer.byteLength(value, 'utf8');
const stringSize = value => utf8(value) + 1;

// Canonicalize RECURSIVELY: JSON.stringify(value, Object.keys(value))
// silently removes most nested Fleet history keys and is NOT acceptable.
export function canonical(value, seen = new Set()) {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Nonfinite number in snapshot');
    return JSON.stringify(value);
  }
  if (typeof value !== 'object') throw new TypeError('Non-JSON value in snapshot');
  if (seen.has(value)) throw new TypeError('Circular reference in snapshot');
  seen.add(value);
  try {
    if (Array.isArray(value)) return '[' + value.map(v => canonical(v, seen)).join(',') + ']';
    if (Object.getPrototypeOf(value) !== Object.prototype &&
        Object.getPrototypeOf(value) !== null)
      throw new TypeError('Non-plain object in JSON snapshot');
    return '{' + Object.keys(value).sort().map(key =>
      JSON.stringify(key) + ':' + canonical(value[key], seen)).join(',') + '}';
  } finally {
    seen.delete(value);
  }
}

function countFields(fields, depth) {
  if (!fields || Array.isArray(fields) || typeof fields !== 'object')
    throw new TypeError('Firestore document must be a JSON object');
  return Object.entries(fields).reduce((size, [name, value]) => {
    const fieldBytes = utf8(name);
    if (!fieldBytes || fieldBytes > 1500 || /^__.*__$/.test(name))
      throw new TypeError('Invalid Firestore field name');
    return size + stringSize(name) + valueSize(value, depth);
  }, 0);
}

function valueSize(value, depth) {
  if (value === null) return 1;
  if (typeof value === 'boolean') return 1;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Nonfinite number');
    return 8;
  }
  if (typeof value === 'string') {
    const size = stringSize(value);
    if (size > MAX_VALUE) throw new RangeError('Firestore field value exceeds 1 MiB - 89 bytes');
    return size;
  }
  if (depth >= 20) throw new RangeError('Firestore nested map/array depth exceeds 20');
  if (Array.isArray(value)) return value.reduce((n, v) => n + valueSize(v, depth + 1), 0);
  if (value && typeof value === 'object') return countFields(value, depth + 1) + 32;
  throw new TypeError('Non-JSON Firestore field type');
}

export function firestoreDocumentBytes(snap, documentPath = DOCUMENT) {
  const segments = documentPath.split('/');
  if (segments.length < 2 || segments.length % 2 !== 0 || segments.some(s => !s))
    throw new TypeError('Document path must be alternating collection/document IDs');
  const documentName = segments.reduce((n, part) => n + stringSize(part), 16);
  if (documentName > 6 * 1024) throw new RangeError('Document name exceeds 6 KiB');
  return documentName + countFields(snap, 0) + 32;
}

export function analyze(snap) {
  if (snap === null || typeof snap !== 'object' || Array.isArray(snap))
    throw new TypeError('Fleet snapshot must be a JSON object');
  const vehicles = Array.isArray(snap.vehicles) ? snap.vehicles.length : 0;
  const drivers = Array.isArray(snap.drivers) ? snap.drivers.length : 0;
  const history = Array.isArray(snap.vehicles)
    ? snap.vehicles.reduce((n, v) => n + (Array.isArray(v?.history) ? v.history.length : 0), 0)
    : 0;
  const json = canonical(snap);
  const jsonBytes = utf8(json);
  const hash = createHash('sha256').update(json).digest('hex');
  let firestoreBytes = null;
  let reason = null;
  try { firestoreBytes = firestoreDocumentBytes(snap); }
  catch (e) {
    if (!(e instanceof TypeError || e instanceof RangeError)) throw e;
    reason = e.message;
  }
  const stop = reason !== null || firestoreBytes >= SAFE_DOCUMENT_LIMIT;
  const warn = stop || firestoreBytes >= WARN;
  return {
    vehicles, drivers, history, jsonBytes, firestoreDocumentBytes: firestoreBytes,
    documentPath: DOCUMENT, limitBytes: SAFE_DOCUMENT_LIMIT,
    warn, stop, reason, hash, estimator: 'firestore-native-json-preflight-v2',
    liveVerified: false
  };
}

function main() {
  const path = process.argv[2];
  const snap = path
    ? JSON.parse(readFileSync(path, 'utf8'))
    : { vehicles: [{ id: 'v1', history: [{ t: 'atadas' }] }], drivers: [{ id: 'd1' }] };
  const result = analyze(snap);
  console.log(JSON.stringify(result, null, 2));
  if (result.stop) {
    console.error('STOP: Firestore document limit / JSON schema validation risk');
    process.exitCode = 2;
  } else if (result.warn) console.error('WARN: approaching Firestore 1 MiB document limit');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();

```

## COMPLETE `staging/imile-management/fleet/v1-canonical-booking-emulator.mjs` – `525b058667ad4edc462c85109fd484b4edfe51ba`

```js
/**
 * ACTUAL Firebase Firestore emulator S7 BOOKING transaction QA (synthetic).
 * run via emulators:exec with --only firestore, demo project.
 * No real Auth, UID, data, network/cloud release or deployment.
 *
 * Tests the SAME commitCanonicalDepotBooking() imported by Depot app.js.
 * This tests one bounded booking and driverClaim transaction, NOT complete
 * Fleet + all mirrored master updates or live 2-PC production readiness.
 */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import {
  doc,getDoc,setDoc,updateDoc,runTransaction,Timestamp
} from 'firebase/firestore';
import {commitCanonicalDepotBooking} from '../../../depokapacitas/canonical-booking-transaction.mjs';

const projectId='demo-imile-restricted-v1';
const uid='synthetic-imile-v1-admin-0000001';
const unauthorizedUid='synthetic-other-user-0000002';
const email='imilemanagement@imile-management-staging.firebaseapp.com';
const digest='d'.repeat(64);
const raw=await readFile(new URL('../../../depokapacitas/firestore-v1-restricted.rules',import.meta.url),'utf8');
assert.match(raw,/REPLACE_WITH_REAL_SHARED_UID/);
const rules=raw.replaceAll('REPLACE_WITH_REAL_SHARED_UID',uid);
const env=await initializeTestEnvironment({
  projectId,firestore:{host:'127.0.0.1',port:8787,rules}
});
const shared=env.authenticatedContext(uid,{email}).firestore();
const sdk={doc,runTransaction};
let passed=0;

function fleet(){
  return {
    revision:1,migrationSourceSha256:digest,
    vehicles:[{id:'fleet-internal-vehicle',rendszam:'ABC-123',
      gyartmany:'Ford',modell:'Transit',status:'aktiv',
      history:[{type:'service',note:'NO REAL DATA'}]}],
    drivers:[{id:'fleet-local-driver',daCode:'DA0001',
      name:'Synthetic Internal Driver',agency:'SYNTHETIC',
      kapacitas:50,status:'aktiv',history:[{type:'assignment'}]}],
    fuelCards:[{id:'synthetic-card',history:[]}],
    contacts:[{id:'synthetic-contact'}]
  };
}
const approval={
  status:'approved',approvedUid:uid,sourceSha256:digest,
  approvedAt:Timestamp.fromDate(new Date('2026-01-01T00:00:00Z'))
};
const book=(date='2099-01-01',extra={})=>
  commitCanonicalDepotBooking({
    db:shared,sdk,uid,getCurrentUid:()=>uid,offline:false,
    booking:{date,driverId:'DA0001',vehicleId:'ABC123',
      district:'01',status:'planned'},
    ...extra
  });
async function shouldReject(label,callback,fragment){
  try{await callback();throw Error('UNEXPECTED SUCCESS: '+label);}
  catch(err){
    if(err.message?.startsWith('UNEXPECTED SUCCESS'))throw err;
    if(fragment)assert.match(String(err.message||err),fragment,label);
    console.log('PASS BLOCK '+label+': '+String(err.code||err.message).slice(0,130));
    passed++;
  }
}
async function seed(overrides={}){
  await env.withSecurityRulesDisabled(async ctx=>{
    const db=ctx.firestore();
    await setDoc(doc(db,'users',uid),{name:'SYNTHETIC ADMIN',active:true,role:'admin'});
    await setDoc(doc(db,'drivers','DA0001'),{
      name:'Synthetic Internal Driver',daCode:'DA0001',
      vendor:'SYNTHETIC',capacity:50,active:true
    });
    await setDoc(doc(db,'vehicles','ABC123'),{
      plate:'ABC123',model:'Ford Transit',status:'Elérhető'
    });
    await setDoc(doc(db,'driverCapacities','DA0001'),{capacity:50});
    if(overrides.fleet!==false)
      await setDoc(doc(db,'flottaSharedState','current'),overrides.fleetData||fleet());
    if(overrides.approval!==false)
      await setDoc(doc(db,'flottaMigrationApproval','current'),overrides.approvalData||approval);
  });
}
async function absence(date){
  for(const [collection,id]of [
    ['bookings',date+'__ABC123'],['driverClaims',date+'__DA0001']]){
    const snap=await getDoc(doc(shared,collection,id));
    assert.equal(snap.exists(),false,collection+' must remain absent: '+id);
  }
}

try{
  await seed({approval:false,fleet:false});
  await shouldReject('no privileged Fleet and policy cannot book',
    ()=>book('2099-01-01'),/BOOKING_BLOCKED: no_server_migration_approval/);
  await absence('2099-01-01');

  await seed();
  const approved=await book('2099-01-01');
  assert.equal(approved.committed,true,'Only actual runTransaction commit can return committed:true');
  assert.equal(approved.fleetRevision,1);
  const booked=await getDoc(doc(shared,'bookings','2099-01-01__ABC123'));
  const claim=await getDoc(doc(shared,'driverClaims','2099-01-01__DA0001'));
  assert.equal(booked.exists(),true);
  assert.equal(claim.exists(),true);
  assert.equal(booked.data().driverId,claim.data().driverId);
  assert.equal(claim.data().bookingId,'2099-01-01__ABC123');
  console.log('PASS [E]: actual committed canonical booking + driverClaim atomic pair');
  passed++;

  await shouldReject('same vehicle and driver cannot be booked twice',
    ()=>book('2099-01-01'),/BOOKING_BLOCKED: already_occupied/);

  // Same actual Firestore client, distinct concurrent transactions.
  const concurrent=await Promise.allSettled([
    book('2099-01-02'),book('2099-01-02')
  ]);
  assert.equal(concurrent.filter(x=>x.status==='fulfilled').length,1,
    'Exactly one concurrent same-slot booking must succeed');
  assert.equal(concurrent.filter(x=>x.status==='rejected').length,1);
  assert.equal((await getDoc(doc(shared,'bookings','2099-01-02__ABC123'))).exists(),true);
  assert.equal((await getDoc(doc(shared,'driverClaims','2099-01-02__DA0001'))).exists(),true);
  console.log('PASS [E]: concurrent clients cannot silently double-book');
  passed++;

  await env.withSecurityRulesDisabled(ctx=>
    updateDoc(doc(ctx.firestore(),'drivers','DA0001'),{name:'CORRUPTED MIRROR'}));
  await shouldReject('out-of-band Depot mirror drift is detected before write',
    ()=>book('2099-01-03'),/BOOKING_BLOCKED: driver_depot_projection_drift/);
  await absence('2099-01-03');
  await env.withSecurityRulesDisabled(ctx=>
    updateDoc(doc(ctx.firestore(),'drivers','DA0001'),{name:'Synthetic Internal Driver'}));

  await env.withSecurityRulesDisabled(ctx=>
    updateDoc(doc(ctx.firestore(),'flottaMigrationApproval','current'),{status:'revoked'}));
  await shouldReject('revoked server migration policy hard-stops booking',
    ()=>book('2099-01-04'),/BOOKING_BLOCKED: no_server_migration_approval/);
  await absence('2099-01-04');
  await env.withSecurityRulesDisabled(ctx=>
    updateDoc(doc(ctx.firestore(),'flottaMigrationApproval','current'),{status:'approved'}));

  await env.withSecurityRulesDisabled(ctx=>
    updateDoc(doc(ctx.firestore(),'flottaSharedState','current'),{migrationSourceSha256:'c'.repeat(64)}));
  await shouldReject('wrong original import SHA blocks booking',
    ()=>book('2099-01-05'),/BOOKING_BLOCKED: fleet_source_not_attested/);
  await absence('2099-01-05');
  await env.withSecurityRulesDisabled(ctx=>
    updateDoc(doc(ctx.firestore(),'flottaSharedState','current'),{migrationSourceSha256:digest}));

  await env.withSecurityRulesDisabled(ctx=>
    updateDoc(doc(ctx.firestore(),'users',uid),{role:'viewer'}));
  await shouldReject('remote role revocation must refuse actual booking writes',
    ()=>book('2099-01-06'),/permission-denied|Missing or insufficient permissions|PERMISSION_DENIED/i);
  await env.withSecurityRulesDisabled(ctx=>
    updateDoc(doc(ctx.firestore(),'users',uid),{role:'admin'}));
  await absence('2099-01-06');

  await shouldReject('client cannot claim online status without verification',
    ()=>book('2099-01-07',{offline:undefined}),/offline_or_unverified_network/);
  await shouldReject('browser auth changed before transaction',
    ()=>book('2099-01-08',{getCurrentUid:()=>unauthorizedUid}),/session_changed/);
  await absence('2099-01-07');
  await absence('2099-01-08');
  console.log('PASS LOCAL EMULATOR canonical Depot actual transaction regression: '+passed+' verified cases (NO LIVE CLOUD)');
}finally{
  await env.cleanup();
}

```

## COMPLETE `staging/imile-management/fleet/v1-restricted-rules-emulator.mjs` – `525b058667ad4edc462c85109fd484b4edfe51ba`

```js
/**
 * Full V1 security boundary on actual Firestore emulator, not a static scan.
 * Node 24; run via Firebase emulators:exec --only firestore on demo project.
 * The real shared UID is NEVER read or published. A synthetic UID replaces
 * its not-deployable placeholder in memory for authorization tests only.
 */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import {collection,doc,getDoc,getDocs,setDoc,updateDoc,deleteDoc,writeBatch,Timestamp} from 'firebase/firestore';

const projectId='demo-imile-restricted-v1';
const uid='synthetic-imile-v1-admin-0000001';
const adversary='synthetic-other-admin-00002';
const courierUid='synthetic-courier-000003';
const email='imilemanagement@imile-management-staging.firebaseapp.com';
const raw=await readFile(new URL('../../../depokapacitas/firestore-v1-restricted.rules',import.meta.url),'utf8');
assert.match(raw,/REPLACE_WITH_REAL_SHARED_UID/);
assert.match(raw,/function courier\(\) \{\s*\/\/[\s\S]*?return false;/);
const rules=raw.replaceAll('REPLACE_WITH_REAL_SHARED_UID',uid);
const env=await initializeTestEnvironment({
  projectId,firestore:{host:'127.0.0.1',port:8787,rules}
});
let passed=0;
async function expectPermission(name,allowed,action){
  try{
    await action();
    assert.ok(allowed,'UNEXPECTED AUTHORIZATION: '+name);
    console.log('PASS ALLOW '+name);passed++;
  }catch(error){
    if(!allowed&&error.code==='permission-denied'){
      console.log('PASS DENY '+name);passed++;return;
    }
    throw new Error('AUTH FAILURE '+name+': '+error.message,{cause:error});
  }
}
const shared=env.authenticatedContext(uid,{email}).firestore();
const spoofedEmail=env.authenticatedContext(adversary,{email}).firestore();
const uidWrongEmail=env.authenticatedContext(uid,{email:'different@example.invalid'}).firestore();
const external=env.authenticatedContext(courierUid,{email:'courier@example.invalid'}).firestore();
const anonymous=env.unauthenticatedContext().firestore();

const user=(db,id)=>doc(db,'users',id);
const fleet=db=>doc(db,'flottaSharedState','current');
const migrationGate=db=>doc(db,'flottaMigrationApproval','current');
const approvedGate={status:'approved',approvedUid:uid,sourceSha256:'f'.repeat(64),approvedAt:Timestamp.fromDate(new Date('2026-01-01T00:00:00Z'))};
const fleetData=(revision)=>({revision,migrationSourceSha256:'f'.repeat(64),vehicles:[],drivers:[],fuelCards:[],contacts:[]});
const driver=(id)=>({name:'SYNTHETIC DRIVER',daCode:id,vendor:'SYNTHETIC',
  capacity:50,active:true});
const vehicle=(id)=>({plate:id,model:'SYNTHETIC CAR',status:'Elérhető'});
function bookFuture(date){
  const bookingId=date+'__TEST0001';
  const b=writeBatch(shared);
  b.set(doc(shared,'bookings',bookingId),{
    date,vehicleId:'TEST0001',driverId:'TEST0001',
    district:'1',status:'planned',capacity:50
  });
  b.set(doc(shared,'driverClaims',date+'__TEST0001'),{
    date,driverId:'TEST0001',bookingId
  });
  return b.commit();
}
const locations=[
  ['users',uid],
  ['drivers','TEST0001'],
  ['vehicles','TEST0001'],
  ['driverCapacities','TEST0001'],
  ['demands','2099-01-01__1'],
  ['results','2099-01-01__TEST0001'],
  ['attendanceVehicleGuards','SYNTH1'],
  ['bookings','SYNTH1'],
  ['driverClaims','SYNTH1'],
  ['attendance','SYNTH1'],
  ['sourceRows','SYNTH1'],
  ['fleetRecords','SYNTH1'],
  ['fleetAssignments','SYNTH1'],
  ['fleetDriverAssignments','SYNTH1'],
  ['fleetMovements','SYNTH1'],
  ['performanceDays','SYNTH1'],
  ['performanceAudits','SYNTH1'],
  ['inventoryDays','SYNTH1'],
  ['inventoryAudits','SYNTH1'],
  ['courierDayPlans','SYNTH1'],
  ['courierAccess',courierUid],
  ['photoUploadPermits','SYNTH1'],
  ['photoUploadQuotas','SYNTH1'],
  ['photoUploadLeases','SYNTH1'],
  ['photoUploadRequests','SYNTH1'],
  ['photoUploadPolicy','SYNTH1'],
  ['photoUploadAdminOps','SYNTH1'],
  ['vehicleSessions','s_'+'a'.repeat(32)],
  ['vehicleLocks','TEST0001'],
  ['driverLocks','TEST0001'],
  ['courierLocks',courierUid],
  ['flottaSharedState','current'],
  ['flottaMigrationApproval','current']
];
try{
  await env.withSecurityRulesDisabled(async ctx=>{
    const db=ctx.firestore();
    await setDoc(user(db,uid),{name:'SYNTHETIC ADMIN',active:true,role:'admin'});
    await setDoc(user(db,adversary),{name:'SYNTHETIC OTHER',active:true,role:'admin'});
    await setDoc(user(db,courierUid),{name:'SYNTHETIC COURIER',active:true,role:'editor'});
    await setDoc(doc(db,'courierAccess',courierUid),{uid:courierUid,active:true,driverId:'TEST0001'});
  });
  // Authentication must be both UID AND email AND active server profile.
  for(const [label,db]of [
    ['other active admin same email',spoofedEmail],
    ['correct UID wrong email',uidWrongEmail],
    ['deferred courier',external],
    ['anonymous',anonymous]
  ]){
    for(const [collection,id]of locations){
      await expectPermission(label+' GET '+collection,false,()=>getDoc(doc(db,collection,id)));
    }
  }

  for(const [collection,id]of locations){
    await expectPermission('other UID cannot create '+collection,false,
      ()=>setDoc(doc(spoofedEmail,collection,id),{arbitrary:'record'}));
  }

  for(const collection of [
    'users','drivers','vehicles','bookings','attendance','fleetRecords',
    'performanceDays','inventoryDays','courierDayPlans','flottaSharedState','flottaMigrationApproval'
  ]){
    const id=collection==='users'?uid:['flottaSharedState','flottaMigrationApproval'].includes(collection)?'current':'SYNTH1';
    await expectPermission('valid shared can get '+collection,true,
      ()=>getDoc(doc(shared,collection,id)));
  }
  await expectPermission('shared admin create driver',true,
    ()=>setDoc(doc(shared,'drivers','TEST0001'),driver('TEST0001')));
  await expectPermission('shared admin create vehicle',true,
    ()=>setDoc(doc(shared,'vehicles','TEST0001'),vehicle('TEST0001')));
  await env.withSecurityRulesDisabled(ctx=>setDoc(
    doc(ctx.firestore(),'driverCapacities','TEST0001'),{capacity:50}
  ));
  // The original Fleet can NEVER be initialized by a browser, even as admin.
  await expectPermission('browser cannot seed initial Fleet snapshot',false,
    ()=>setDoc(fleet(shared),fleetData(1)));
  await expectPermission('browser cannot self-approve migration',false,
    ()=>setDoc(migrationGate(shared),approvedGate));
  // Trusted, pre-approved migration path is represented ONLY by a Rules-bypass
  // emulator seed. No real privilege or data is used in this test.
  await env.withSecurityRulesDisabled(async ctx=>{
    await setDoc(fleet(ctx.firestore()),fleetData(1));
  });
  await expectPermission('canonical Fleet existence freezes browser driver master edits',false,
    ()=>updateDoc(doc(shared,'drivers','TEST0001'),{name:'DRIFT'}));
  await expectPermission('canonical Fleet existence freezes browser vehicle master edits',false,
    ()=>updateDoc(doc(shared,'vehicles','TEST0001'),{status:'Szerviz'}));
  await expectPermission('before source approval cannot create booking even with otherwise valid atomic claim',false,
    ()=>bookFuture('2099-01-01'));
  await expectPermission('pre-approval Fleet update is denied',false,
    ()=>updateDoc(fleet(shared),{revision:2}));
  await env.withSecurityRulesDisabled(async ctx=>{
    await setDoc(migrationGate(ctx.firestore()),{...approvedGate,status:'pending'});
  });
  await expectPermission('pending migration approval denies Fleet update',false,
    ()=>updateDoc(fleet(shared),{revision:2}));
  await env.withSecurityRulesDisabled(async ctx=>{
    await setDoc(migrationGate(ctx.firestore()),{...approvedGate,approvedUid:adversary});
  });
  await expectPermission('wrong UID migration approval denies Fleet update',false,
    ()=>updateDoc(fleet(shared),{revision:2}));
  await env.withSecurityRulesDisabled(async ctx=>{
    await setDoc(migrationGate(ctx.firestore()),{...approvedGate,sourceSha256:'INVALID'});
  });
  await expectPermission('invalid migration source digest denies Fleet update',false,
    ()=>updateDoc(fleet(shared),{revision:2}));
  await expectPermission('invalid migration source digest denies atomic booking',false,
    ()=>bookFuture('2099-01-01'));
  await env.withSecurityRulesDisabled(async ctx=>{
    await setDoc(migrationGate(ctx.firestore()),approvedGate);
  });
  await expectPermission('shared admin may read server migration approval',true,
    ()=>getDoc(migrationGate(shared)));
  await expectPermission('shared admin increments revision after trusted approval',true,
    ()=>updateDoc(fleet(shared),{revision:2}));
  await expectPermission('browser cannot forge an imported Fleet source SHA',false,
    ()=>updateDoc(fleet(shared),{revision:3,migrationSourceSha256:'b'.repeat(64)}));
  await expectPermission('browser cannot strip the original Fleet import source SHA',false,
    ()=>updateDoc(fleet(shared),{revision:3,migrationSourceSha256:null}));
  await expectPermission('approved original Fleet source admits atomic booking + claim',true,
    ()=>bookFuture('2099-01-01'));
  await expectPermission('approval cannot be revoked by browser',false,
    ()=>updateDoc(migrationGate(shared),{status:'revoked'}));
  await expectPermission('stale Fleet revision fails',false,
    ()=>updateDoc(fleet(shared),{revision:2}));
  await expectPermission('skipped Fleet revision fails',false,
    ()=>updateDoc(fleet(shared),{revision:4}));
  await expectPermission('cannot delete Fleet snapshot',false,
    ()=>deleteDoc(fleet(shared)));
  // Trusted revocation is effective for an already authenticated shared UID.
  await env.withSecurityRulesDisabled(async ctx=>{
    await setDoc(migrationGate(ctx.firestore()),{...approvedGate,status:'revoked'});
  });
  await expectPermission('revoked migration approval denies Fleet update',false,
    ()=>updateDoc(fleet(shared),{revision:3}));
  await expectPermission('revoked migration approval denies NEW booking',false,
    ()=>bookFuture('2099-01-02'));
  await expectPermission('browser cannot recreate revoked migration approval',false,
    ()=>setDoc(migrationGate(shared),approvedGate));
  await env.withSecurityRulesDisabled(async ctx=>{
    await setDoc(migrationGate(ctx.firestore()),approvedGate);
  });

  await expectPermission('admin cannot create another user profile',false,
    ()=>setDoc(user(shared,'synthetic-extra'),{name:'SYNTHETIC EXTRA',active:true,role:'admin'}));
  await expectPermission('admin cannot downgrade own role in browser',false,
    ()=>updateDoc(user(shared,uid),{role:'viewer'}));
  await expectPermission('admin cannot enumerate internal profiles',false,
    ()=>getDocs(collection(shared,'users')));
  // Role downgrade from the authorized console still takes effect immediately.
  await env.withSecurityRulesDisabled(ctx=>
    setDoc(user(ctx.firestore(),uid),{name:'SYNTHETIC VIEWER',active:true,role:'viewer'}));
  await expectPermission('shared viewer may read Fleet',true,()=>getDoc(fleet(shared)));
  await expectPermission('shared viewer cannot write Fleet',false,
    ()=>updateDoc(fleet(shared),{revision:3}));
  await env.withSecurityRulesDisabled(ctx=>
    setDoc(user(ctx.firestore(),uid),{name:'SYNTHETIC ADMIN',active:true,role:'admin'}));

  // Revoke access at source: previously authenticated token must not suffice.
  await env.withSecurityRulesDisabled(ctx=>
    setDoc(user(ctx.firestore(),uid),{name:'SYNTHETIC REVOKED',active:false,role:'admin'}));
  for(const collection of ['users','drivers','vehicles','fleetRecords','bookings','flottaSharedState']){
    const id=collection==='users'?uid:['flottaSharedState','flottaMigrationApproval'].includes(collection)?'current':'SYNTH1';
    await expectPermission('revoked user cannot read '+collection,false,
      ()=>getDoc(doc(shared,collection,id)));
  }
  await expectPermission('revoked user cannot update Fleet',false,
    ()=>updateDoc(fleet(shared),{revision:3}));
  console.log('PASS V1 RESTRICTED EMULATOR: '+passed+
    ' positive/negative checks across '+locations.length+' collection paths');
}finally{
  await env.cleanup();
}

```

## COMPLETE `firebase.staging-emulator.json` – `525b058667ad4edc462c85109fd484b4edfe51ba`

```json
{
  "firestore": {"rules": "depokapacitas/firestore.rules"},
  "emulators": {"firestore": {"host": "127.0.0.1", "port": 8787}, "ui": {"enabled": false}}
}

```

## Grok latest pure independent-edit hardstop test – `bd7ef2db2772f388e7e72299c7487c580bdf3c64`

```js
import test from 'node:test';
import assert from 'node:assert/strict';

// Pure model of the hard-stop: a Flotta update that does not also project
// the masters in the same transaction must be rejected by rules.
function flottaUpdateAllowed({ preservesSha, incrementsRevision, projectsMasters }) {
  return preservesSha && incrementsRevision && projectsMasters;
}

test('independent edit that skips projection is denied', () => {
  assert.equal(flottaUpdateAllowed({
    preservesSha: true, incrementsRevision: true, projectsMasters: false
  }), false);
});

test('atomic projection is allowed', () => {
  assert.equal(flottaUpdateAllowed({
    preservesSha: true, incrementsRevision: true, projectsMasters: true
  }), true);
});

test('missing SHA is denied', () => {
  assert.equal(flottaUpdateAllowed({
    preservesSha: false, incrementsRevision: true, projectsMasters: true
  }), false);
});

console.log('independent edit hard-stop tests defined');

```

## Actual synthetic schema, not real user data

```json
{
 "users/{syntheticUid}":{"name":"SYNTHETIC ADMIN","active":true,"role":"admin"},
 "flottaMigrationApproval/current":{"status":"approved","approvedUid":"SYNTHETIC_UID","sourceSha256":"<64 lowercase hex>","approvedAt":"Firestore Timestamp"},
 "flottaSharedState/current":{"revision":1,"migrationSourceSha256":"<same SHA>","vehicles":[{"id":"local-id","rendszam":"ABC-123","gyartmany":"Ford","modell":"Transit","status":"aktiv","history":[{"synthetic":true}]}],"drivers":[{"id":"local-id","daCode":"DA0001","name":"Synthetic","agency":"Vendor","kapacitas":80,"status":"aktiv","history":[]}],"fuelCards":[],"contacts":[]},
 "drivers/DA0001":{"name":"Synthetic","daCode":"DA0001","vendor":"Vendor","capacity":80,"active":true},
 "vehicles/ABC123":{"plate":"ABC123","model":"Ford Transit","status":"Elérhető"},
 "driverCapacities/DA0001":{"capacity":80},
 "bookings/2099-01-01__ABC123":{"date":"2099-01-01","vehicleId":"ABC123","driverId":"DA0001","district":"01","status":"planned","capacity":80},
 "driverClaims/2099-01-01__DA0001":{"date":"2099-01-01","driverId":"DA0001","bookingId":"2099-01-01__ABC123"},
 "vehicleClaims":"NOT IMPLEMENTED IN CURRENT V1"
}
```

**Claude please deliver:** concise threat model and exact source-referenced violations; a SINGLE viable Spark free architecture and its limitations; REAL executable LOCAL emulator test proposals with valid actual schema, no assumed vehicleClaims; explain whether same-document `depotIndex` is worth 1 MiB and client-forged-index risk, versus read-verified canonical arrays; if no Rules-verifiable mechanism exists for all desired invariants, classify NO-GO. Owner has not authorized deployment or real data access.
