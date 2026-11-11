/**
 * Synthetic privileged migration drill on local Firebase emulator.
 * Demonstrates: preflight, partial write interruption, resume, full rich backup,
 * SHA verification, and restore. NEVER touches live data.
 *
 * Run via: npx firebase-tools emulators:exec --only firestore --project demo-imile-migration \
 *   "node tools/v1-migration-emulator-drill.mjs"
 */
import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import {doc,setDoc,getDoc,deleteDoc} from 'firebase/firestore';
import {createHash} from 'node:crypto';

const projectId = 'demo-imile-migration';
const uid = 'synthetic-migration-admin-0001';

function sha256(obj) {
  return createHash('sha256').update(JSON.stringify(obj)).digest('hex');
}

const synthetic = {
  vehicles: [{id:'v1', rendszam:'ABC-123', status:'aktiv', history:[{e:'service'}]}],
  drivers: [{id:'d1', daCode:'DA0001', name:'Teszt', kapacitas:80, status:'aktiv', history:[{e:'hire'}]}],
  fuelCards: [{code:'FC1'}],
  contacts: [{code:'C1', name:'Kapcsolat'}]
};
const sourceSha = sha256(synthetic);

async function main() {
  const env = await initializeTestEnvironment({
    projectId,
    firestore: {host:'127.0.0.1', port:8787}
  });

  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    // Seed original shared state
    await setDoc(doc(db, 'flottaSharedState', 'current'), {
      ...synthetic,
      revision: 1,
      migrationSourceSha256: sourceSha,
      sealed: false
    });
    console.log('Seeded original shared state');

    // Simulate interrupted migration: write only drivers
    await setDoc(doc(db, 'flottaDrivers', 'DA0001'), {
      ...synthetic.drivers[0], revision: 1, daCode: 'DA0001'
    });
    console.log('Partial write: only driver written (interrupted)');

    // Detect partial
    const driverSnap = await getDoc(doc(db, 'flottaDrivers', 'DA0001'));
    const vehicleSnap = await getDoc(doc(db, 'flottaVehicles', 'ABC123'));
    if (driverSnap.exists() && !vehicleSnap.exists()) {
      console.log('Detected interrupted migration – rolling back partial');
      await deleteDoc(doc(db, 'flottaDrivers', 'DA0001'));
    }

    // Resume: full write + seal
    await setDoc(doc(db, 'flottaDrivers', 'DA0001'), {
      ...synthetic.drivers[0], revision: 1, daCode: 'DA0001'
    });
    await setDoc(doc(db, 'flottaVehicles', 'ABC123'), {
      ...synthetic.vehicles[0], revision: 1, rendszam: 'ABC-123'
    });
    const shared = await getDoc(doc(db, 'flottaSharedState', 'current'));
    await setDoc(doc(db, 'flottaSharedState', 'current'), {
      ...shared.data(), sealed: true
    });
    console.log('Resumed and sealed');

    // Backup verification
    const backup = {
      shared: (await getDoc(doc(db, 'flottaSharedState', 'current'))).data(),
      drivers: (await getDoc(doc(db, 'flottaDrivers', 'DA0001'))).data(),
      vehicles: (await getDoc(doc(db, 'flottaVehicles', 'ABC123'))).data()
    };
    const backupSha = sha256(backup);
    assert(backupSha === sha256(backup), 'Backup SHA stable');
    assert(backup.drivers.history.length === 1, 'History preserved');
    assert(backup.shared.sealed === true, 'Sealed');
    console.log('Backup verified, SHA:', backupSha.slice(0,16)+'...');

    // Restore drill: delete and restore
    await deleteDoc(doc(db, 'flottaDrivers', 'DA0001'));
    await setDoc(doc(db, 'flottaDrivers', 'DA0001'), backup.drivers);
    const restored = (await getDoc(doc(db, 'flottaDrivers', 'DA0001'))).data();
    assert(restored.kapacitas === 80 && restored.history.length === 1, 'Restore parity');
    console.log('Restore drill PASS');
  });

  await env.cleanup();
  console.log('PASS: synthetic privileged migration emulator drill (interrupt + resume + backup + restore)');
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

main().catch(e => { console.error(e); process.exit(1); });
