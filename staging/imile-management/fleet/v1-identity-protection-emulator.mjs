/**
 * V1 identity protection proof on actual Firestore emulator.
 * Proves all five #133 direct-SDK attacks are DENIED when authentic counters
 * are present and single-row counter protocol is enforced.
 * Isolated #136 is NOT considered the solution; this runs against the real
 * restricted Rules.
 */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import {doc, updateDoc, setDoc, writeBatch} from 'firebase/firestore';

const projectId = 'demo-imile-identity-protection';
const uid = 'synthetic-imile-v1-admin-0000001';
const email = 'imilemanagement@imile-management-staging.firebaseapp.com';
const raw = await readFile(new URL('../../../depokapacitas/firestore-v1-restricted.rules', import.meta.url), 'utf8');
const rules = raw.replaceAll('REPLACE_WITH_REAL_SHARED_UID', uid);
const env = await initializeTestEnvironment({
  projectId, firestore: {host: '127.0.0.1', port: 8787, rules}
});
const shared = env.authenticatedContext(uid, {email}).firestore();
const fleet = db => doc(db, 'flottaSharedState', 'current');
const migrationGate = db => doc(db, 'flottaMigrationApproval', 'current');
const approvedGate = {status: 'approved', approvedUid: uid, sourceSha256: 'f'.repeat(64), approvedAt: new Date('2026-01-01T00:00:00Z')};

function authenticIdentity(drivers, vehicles) {
  const daCnt = {};
  for (const d of drivers) {
    const k = String(d.daCode || '').toUpperCase();
    if (k) daCnt[k] = (daCnt[k] || 0) + 1;
  }
  const plateCnt = {};
  for (const v of vehicles) {
    const k = String(v.rendszam || '').replace(/[\s-]/g, '').toUpperCase();
    if (k) plateCnt[k] = (plateCnt[k] || 0) + 1;
  }
  return {daCnt, plateCnt};
}

const baseDrivers = [{daCode: 'TEST0001', status: 'aktiv', kapacitas: 50}];
const baseVehicles = [{rendszam: 'TEST0001', status: 'aktiv', normalizedPlate: 'TEST0001'}];
const base = (rev = 1) => ({
  revision: rev,
  migrationSourceSha256: 'f'.repeat(64),
  vehicles: baseVehicles,
  drivers: baseDrivers,
  fuelCards: [],
  contacts: [],
  identity: authenticIdentity(baseDrivers, baseVehicles),
  lastChange: {driverIndex: 0}
});

function bookFuture(date, {vehicleId = 'TEST0001', driverId = 'TEST0001', capacity = 50, driverIndex = 0, vehicleIndex = 0} = {}) {
  const bookingId = date + '__' + vehicleId;
  const b = writeBatch(shared);
  b.set(doc(shared, 'bookings', bookingId), {
    date, vehicleId, driverId, district: '1', status: 'planned', capacity,
    driverIndex, vehicleIndex
  });
  b.set(doc(shared, 'driverClaims', date + '__' + driverId), {
    date, driverId, bookingId
  });
  return b.commit();
}

async function mustDeny(label, action) {
  try {
    await action();
    throw new Error('UNEXPECTED ALLOW: ' + label);
  } catch (e) {
    if (e.code === 'permission-denied') {
      console.log('PASS DENY [E+SDK]: ' + label);
      return;
    }
    if (e.message && e.message.startsWith('UNEXPECTED ALLOW')) throw e;
    throw new Error('Unexpected error on ' + label + ': ' + e.message, {cause: e});
  }
}

try {
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users', uid), {name: 'SYNTHETIC ADMIN', active: true, role: 'admin'});
    await setDoc(migrationGate(db), approvedGate);
    await setDoc(fleet(db), base(1));
  });

  // 1. Direct SDK inserts identical DA twice
  await mustDeny('direct SDK editor inserts identical DA twice', () =>
    updateDoc(fleet(shared), {
      revision: 2,
      drivers: [
        {daCode: 'TEST0001', status: 'aktiv', kapacitas: 50},
        {daCode: 'TEST0001', status: 'aktiv', kapacitas: 500}
      ],
      identity: authenticIdentity(
        [{daCode: 'TEST0001'}, {daCode: 'TEST0001'}],
        baseVehicles
      ),
      lastChange: {driverIndex: 1}
    })
  );

  // Seed hostile with authentic count=2 for booking test
  await env.withSecurityRulesDisabled(ctx => setDoc(fleet(ctx.firestore()), {
    ...base(2),
    drivers: [
      {daCode: 'TEST0001', status: 'aktiv', kapacitas: 50},
      {daCode: 'TEST0001', status: 'aktiv', kapacitas: 500}
    ],
    identity: authenticIdentity(
      [{daCode: 'TEST0001'}, {daCode: 'TEST0001'}],
      baseVehicles
    )
  }));
  // 2. Forged second DA index books 500
  await mustDeny('forged second DA index books 500 capacity', () =>
    bookFuture('2099-02-16', {driverIndex: 1, capacity: 500})
  );

  // 3. Mixed-case duplicate DA, first row
  await env.withSecurityRulesDisabled(ctx => setDoc(fleet(ctx.firestore()), {
    ...base(3),
    drivers: [
      {daCode: 'TEST0001', status: 'aktiv', kapacitas: 50},
      {daCode: 'test0001', status: 'aktiv', kapacitas: 500}
    ],
    identity: authenticIdentity(
      [{daCode: 'TEST0001'}, {daCode: 'test0001'}],
      baseVehicles
    )
  }));
  await mustDeny('mixed-case duplicate DA first row still books', () =>
    bookFuture('2099-02-17', {driverIndex: 0, capacity: 50})
  );

  // 4. Duplicate normalized plate, second available while first service
  await env.withSecurityRulesDisabled(ctx => setDoc(fleet(ctx.firestore()), {
    ...base(4),
    vehicles: [
      {rendszam: 'TEST0001', status: 'szerviz', normalizedPlate: 'TEST0001'},
      {rendszam: 'TEST-0001', status: 'aktiv', normalizedPlate: 'TEST0001'}
    ],
    identity: authenticIdentity(baseDrivers, [
      {rendszam: 'TEST0001'},
      {rendszam: 'TEST-0001'}
    ])
  }));
  await mustDeny('forged second vehicle index bypasses service', () =>
    bookFuture('2099-02-18', {vehicleIndex: 1, capacity: 50})
  );

  // 5. Direct SDK inserts normalized duplicate plate
  await env.withSecurityRulesDisabled(ctx => setDoc(fleet(ctx.firestore()), base(5)));
  await mustDeny('direct SDK editor inserts normalized duplicate plate', () =>
    updateDoc(fleet(shared), {
      revision: 6,
      vehicles: [
        {rendszam: 'TEST0001', status: 'szerviz', normalizedPlate: 'TEST0001'},
        {rendszam: 'TEST-0001', status: 'aktiv', normalizedPlate: 'TEST0001'}
      ],
      identity: authenticIdentity(baseDrivers, [
        {rendszam: 'TEST0001'},
        {rendszam: 'TEST-0001'}
      ]),
      lastChange: {vehicleIndex: 1}
    })
  );

  // Positive: legitimate single-row non-identity edit
  await env.withSecurityRulesDisabled(ctx => setDoc(fleet(ctx.firestore()), base(6)));
  const next = base(7);
  next.drivers[0].name = 'EDITED NAME';
  next.identity = authenticIdentity(next.drivers, next.vehicles);
  await updateDoc(fleet(shared), {
    drivers: next.drivers,
    identity: next.identity,
    lastChange: {driverIndex: 0},
    revision: 7
  });
  console.log('PASS ALLOW [E+SDK]: legitimate single-row non-identity edit');

  console.log('ALL FIVE #133 DIRECT-SDK ATTACKS DENIED; legitimate edit allowed.');
} finally {
  await env.cleanup();
}
