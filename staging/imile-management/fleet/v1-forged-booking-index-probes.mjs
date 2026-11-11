/**
 * #133 original three forged booking-index attacks under full current Rules.
 * Synthetic privileged pre-seed of intentionally inconsistent source,
 * then authenticated client attempts that must be DENIED.
 * Local emulator only.
 */
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing';
import {doc,setDoc,updateDoc} from 'firebase/firestore';
import {readFile} from 'node:fs/promises';

const uid='synthetic-imile-v1-admin-0000001';
const email='imilemanagement@imile-management-staging.firebaseapp.com';
const projectId='demo-imile-restricted-v1';

async function main(){
  const raw=await readFile(new URL('../../../depokapacitas/firestore-v1-restricted.rules',import.meta.url),'utf8');
  assert.match(raw,/REPLACE_WITH_REAL_SHARED_UID/);
  const env=await initializeTestEnvironment({
    projectId,
    firestore:{host:'127.0.0.1',port:8787,rules:raw.replaceAll('REPLACE_WITH_REAL_SHARED_UID',uid)}
  });
  const client=env.authenticatedContext(uid,{email}).firestore();
  try{
    // Privileged seed of a sealed but internally inconsistent source
    // (duplicate normalized plate, mismatched index intent)
    await env.withSecurityRulesDisabled(async ctx=>{
      const db=ctx.firestore();
      await setDoc(doc(db,'users',uid),{active:true,role:'admin',name:'SYNTHETIC'});
      await setDoc(doc(db,'flottaMigrationApproval','current'),{
        status:'approved',approvedUid:uid,sourceSha256:'a'.repeat(64),
        approvedAt:new Date('2026-01-01T00:00:00Z')
      });
      await setDoc(doc(db,'flottaSharedState','current'),{
        revision:1,sealed:true,migrationSourceSha256:'a'.repeat(64),
        drivers:[
          {daCode:'DA0001',name:'A',kapacitas:80},
          {daCode:'DA0001',name:'B',kapacitas:50} // intentional duplicate
        ],
        vehicles:[
          {rendszam:'ABC-123',status:'aktiv'},
          {rendszam:'ABC 123',status:'aktiv'} // normalized collision
        ],
        fuelCards:[],contacts:[]
      });
      // Legitimate keyed masters for the first identity only
      await setDoc(doc(db,'flottaDrivers','DA0001'),{
        daCode:'DA0001',status:'aktiv',kapacitas:80,revision:1,history:[]
      });
      await setDoc(doc(db,'flottaVehicles','ABC123'),{
        rendszam:'ABC-123',status:'aktiv',revision:1,history:[]
      });
    });

    const tomorrow='2026-11-12';

    // Attack 1: forged driverIndex pointing at the duplicate DA
    await assertFails(setDoc(doc(client,'bookings',tomorrow+'__ABC123'),{
      date:tomorrow,driverId:'DA0001',vehicleId:'ABC123',
      driverIndex:1,vehicleIndex:0,capacity:80,district:'IX',status:'planned'
    }));

    // Attack 2: forged vehicleIndex claiming the colliding plate
    await assertFails(setDoc(doc(client,'bookings',tomorrow+'__ABC123'),{
      date:tomorrow,driverId:'DA0001',vehicleId:'ABC123',
      driverIndex:0,vehicleIndex:1,capacity:80,district:'IX',status:'planned'
    }));

    // Attack 3: index-only booking that invents a capacity not present in keyed master
    await assertFails(setDoc(doc(client,'bookings',tomorrow+'__ABC123'),{
      date:tomorrow,driverId:'DA0001',vehicleId:'ABC123',
      driverIndex:0,vehicleIndex:0,capacity:999,district:'IX',status:'planned'
    }));

    console.log('PASS: all three #133 forged booking-index attacks denied under current Rules');
  }finally{
    await env.cleanup();
  }
}
main().catch(e=>{console.error(e);process.exit(1);});
