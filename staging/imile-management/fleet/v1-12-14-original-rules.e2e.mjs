/**
 * ACTUAL original restricted Rules + Auth/Firestore emulators, 12 drivers and
 * 14 vehicles (plus 14 fuelCards and 5 contacts). Synthetic source only.
 * A local privileged test fixture seeds immutable keyed masters/claims; this
 * is NOT an approved importer, independently authenticated owner or real seal.
 * Runs only via firebase emulators:exec; never calls cloud or live URLs.
 *
 * IMPORTANT: Original genuine poisoned-privileged-source P0 remains RED.
 * This script verifies valid/invalid client paths without weakening that P0.
 */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import {doc,getDoc,setDoc,writeBatch,Timestamp} from 'firebase/firestore';
import {preflight,buildPlan,simulateBackup,restoreDrill,sha256} from '../../../tools/v1-migration-dryrun.mjs';

const projectId='demo-imile-restricted-v1';
const uid='synthetic-imile-v1-admin-0000001';
const email='imilemanagement@imile-management-staging.firebaseapp.com';
const host=process.env.FIRESTORE_EMULATOR_HOST;
const date='2099-03-03',secondDay='2099-03-04';
const source=()=>({
  drivers:Array.from({length:12},(_,i)=>({
    id:'local-rich-driver-'+(i+1),
    daCode:'DA'+String(i+1).padStart(4,'0'),
    name:'SYNTHETIC COURIER '+(i+1),
    status:'aktiv',kapacitas:80,agency:'SYNTHETIC',
    history:[{kind:'hire',when:'2026-01-01',details:{provenance:'synthetic'}}]
  })),
  vehicles:Array.from({length:14},(_,i)=>({
    id:'local-rich-vehicle-'+(i+1),
    rendszam:'ABC-'+String(i+1).padStart(3,'0'),
    status:'aktiv',gyartmany:'SYNTHETIC',modell:'Transit',
    km:1000+i,
    history:[{kind:'service',when:'2026-01-02',details:{km:1000+i}}]
  })),
  fuelCards:Array.from({length:14},(_,i)=>({
    id:'local-fuel-'+(i+1),history:[{kind:'issue',when:'2026-01-01'}]
  })),
  contacts:Array.from({length:5},(_,i)=>({
    id:'local-contact-'+(i+1),role:'synthetic'
  }))
});
function booking(db,{day=date,driverIndex=0,vehicleIndex=0,capacity=80}={}){
  const vehicleId='ABC001',driverId='DA0001';
  const bookingId=day+'__'+vehicleId;
  const batch=writeBatch(db);
  batch.set(doc(db,'bookings',bookingId),{
    date:day,vehicleId,driverId,district:'IX',
    status:'planned',capacity,driverIndex,vehicleIndex
  });
  batch.set(doc(db,'driverClaims',day+'__'+driverId),{
    date:day,driverId,bookingId
  });
  return batch.commit();
}
async function denied(label,request){
  try{await request();throw Error('UNSAFE_ALLOW: '+label)}
  catch(e){
    if(e.message?.startsWith('UNSAFE_ALLOW:'))throw e;
    assert.equal(e.code,'permission-denied',label+' must be a genuine Rules denial');
  }
}
async function main(){
  if(!['127.0.0.1:8787','localhost:8787'].includes(host)||process.env.GOOGLE_APPLICATION_CREDENTIALS||process.env.FIREBASE_SERVICE_ACCOUNT)
    throw Error('LOCAL_FIRESTORE_EMULATOR_ONLY_NO_CLOUD_CREDENTIALS');
  const s=source();
  const checked=preflight(s);
  assert.equal(checked.ok,true,checked.errors.join('; '));
  assert.deepEqual(checked.counts,{vehicles:14,drivers:12,fuelCards:14,contacts:5});
  const backup=simulateBackup(s);
  const originalSha=sha256(s);
  assert.equal(restoreDrill(backup,originalSha).ok,true);
  assert.deepEqual(backup.snapshot,s,'All nested rich history, fuel cards, contacts and IDs preserved');
  const tampered=structuredClone(backup);
  tampered.snapshot.vehicles[0].history[0].details.km++;
  assert.equal(restoreDrill(tampered,originalSha).ok,false);
  const duplicate=source();
  duplicate.drivers[1].daCode='da0001';
  assert.equal(preflight(duplicate).ok,false,'Case-folded normalized duplicate must fail before local import plan');
  const duplicateVehicle=source();
  duplicateVehicle.vehicles[1].rendszam='abc001';
  assert.equal(preflight(duplicateVehicle).ok,false,'Normalized plate collision fails original preflight');
  const plan=buildPlan(s,checked);
  assert.deepEqual(plan.sourceCounts,{vehicles:14,drivers:12,fuelCards:14,contacts:5});
  assert.equal(plan.authorizedForImport,false);
  assert.equal(plan.firestoreEncodedSizeVerified,false);
  assert.equal(plan.drivers[0].data.sourceIndex,0);
  assert.equal(plan.vehicles[0].data.sourceIndex,0);
  console.log('PASS [OFFLINE]: 12/14/14/5 complete source, duplicate rejection and full-rich SHA restore');

  const raw=await readFile(new URL('../../../depokapacitas/firestore-v1-restricted.rules',import.meta.url),'utf8');
  assert.match(raw,/REPLACE_WITH_REAL_SHARED_UID/);
  assert.match(raw,/privileged poisoned|P0/i);
  const env=await initializeTestEnvironment({
    projectId,firestore:{
      host:'127.0.0.1',port:8787,
      rules:raw.replaceAll('REPLACE_WITH_REAL_SHARED_UID',uid)
    }
  });
  try{
    const anon=env.unauthenticatedContext().firestore();
    const client=env.authenticatedContext(uid,{email}).firestore();
    await denied('anonymous cannot write source',()=>setDoc(doc(anon,'flottaSharedState','current'),{revision:1}));
    await denied('authenticated browser cannot seed privileged archive',()=>setDoc(doc(client,'flottaSharedState','current'),{revision:1}));

    // Only privileged TEST fixture. No API, IAM changes or actual migration.
    await env.withSecurityRulesDisabled(async ctx=>{
      const admin=ctx.firestore();
      await setDoc(doc(admin,'users',uid),{active:true,role:'admin',name:'SYNTHETIC QA ADMIN'});
      await setDoc(doc(admin,'flottaMigrationApproval','current'),{
        status:'approved',approvedUid:uid,sourceSha256:originalSha,
        approvedAt:Timestamp.fromDate(new Date('2026-01-01T00:00:00Z'))
      });
      await setDoc(doc(admin,'flottaSharedState','current'),{
        ...structuredClone(s),revision:1,sealed:true,migrationSourceSha256:originalSha
      });
      for(const row of plan.drivers){
        await setDoc(doc(admin,'flottaDrivers',row.id),row.data);
        await setDoc(doc(admin,'flottaDriverClaims',row.id),{
          sourceIndex:row.data.sourceIndex,revision:row.data.revision
        });
      }
      for(const row of plan.vehicles){
        await setDoc(doc(admin,'flottaVehicles',row.id),row.data);
        await setDoc(doc(admin,'flottaVehicleClaims',row.id),{
          sourceIndex:row.data.sourceIndex,revision:row.data.revision
        });
      }
    });

    const live=await getDoc(doc(client,'flottaSharedState','current'));
    assert.equal(live.exists(),true);
    const current=live.data();
    assert.deepEqual(current.drivers,s.drivers);
    assert.deepEqual(current.vehicles,s.vehicles);
    assert.deepEqual(current.fuelCards,s.fuelCards);
    assert.deepEqual(current.contacts,s.contacts);
    assert.equal(current.migrationSourceSha256,originalSha);
    assert.equal((await getDoc(doc(client,'flottaDrivers','DA0001'))).data().kapacitas,80);
    assert.equal((await getDoc(doc(client,'flottaVehicles','ABC001'))).data().history.length,1);
    console.log('PASS [E+SDK]: signed-in original full Rules reads all 26 rich keyed masters and original four-array archive');

    await booking(client);
    assert.equal((await getDoc(doc(client,'bookings',date+'__ABC001'))).data().capacity,80);
    assert.equal((await getDoc(doc(client,'driverClaims',date+'__DA0001'))).data().bookingId,date+'__ABC001');
    console.log('PASS ALLOW [E+SDK]: real two-document booking under ORIGINAL restricted Rules');

    await denied('forged capacity 999',()=>booking(client,{day:secondDay,capacity:999}));
    await denied('forged sourceIndex 1',()=>booking(client,{day:secondDay,driverIndex:1}));
    await denied('client cannot modify privileged source claim',()=>
      setDoc(doc(client,'flottaDriverClaims','DA0001'),{sourceIndex:1,revision:1}));
    assert.equal((await getDoc(doc(client,'bookings',secondDay+'__ABC001'))).exists(),false);
    console.log('PASS DENY [E+SDK]: real original Rules reject forged booked capacity/index and privileged claim rewrite');
    console.log('SCOPE: synthetic sealed fixture only; original privileged poisoned-source P0 remains mandatory RED');
  }finally{await env.cleanup()}
}
main().catch(e=>{console.error('V1 ACTUAL ORIGINAL RULES 12/14 E2E FAILED',e);process.exitCode=1});
