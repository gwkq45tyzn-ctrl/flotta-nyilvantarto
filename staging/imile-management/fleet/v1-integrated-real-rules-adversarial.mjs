/**
 * QA of ACTUAL Grok #114 Firestore Security Rules and booking adapter, LOCAL
 * emulators only. Positive/negative tests under synthetic shared account.
 *
 * A PASS on a "P0 BUG" case means that the unsafe behavior was reproduced.
 * Never interpret a green attack witness as a GO decision.
 */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import {doc,getDoc,setDoc,runTransaction,Timestamp} from 'firebase/firestore';
import {commitCanonicalDepotBooking} from '../../../depokapacitas/canonical-booking-transaction.mjs';

const uid='synthetic-imile-v1-admin-0000001';
const email='imilemanagement@imile-management-staging.firebaseapp.com';
const sha='f'.repeat(64);
const ruleText=await readFile(new URL('../../../depokapacitas/firestore-v1-restricted.rules',import.meta.url),'utf8');
assert.ok(ruleText.includes('REPLACE_WITH_REAL_SHARED_UID'));
const env=await initializeTestEnvironment({
  projectId:'demo-imile-restricted-v1',
  firestore:{host:'127.0.0.1',port:8787,
    rules:ruleText.replaceAll('REPLACE_WITH_REAL_SHARED_UID',uid)}
});
const db=env.authenticatedContext(uid,{email}).firestore();
const fleetRef=doc(db,'flottaSharedState','current');
const date='2099-06-15',bookingId=date+'__ABC123',claimId=date+'__DA0001';
const bookingRef=doc(db,'bookings',bookingId),claimRef=doc(db,'driverClaims',claimId);

function fleet({plate='ABC123',vehicleStatus='aktiv',code='DA0001',driverStatus='aktiv',dupe=false}={}){
  const vehicle={id:'original-v1',rendszam:plate,gyartmany:'Ford',
    modell:'Transit',status:vehicleStatus,
    history:[{type:'service',note:'SYNTHETIC HISTORY'}]};
  const driver={id:'original-d1',daCode:code,name:'ORIGINAL DRIVER',
    agency:'SYNTHETIC',kapacitas:50,status:driverStatus,
    history:[{type:'assignment',note:'SYNTHETIC'}]};
  return {
    revision:1,migrationSourceSha256:sha,
    vehicles:dupe?[vehicle,{...vehicle,id:'original-v2',status:'szerviz'}]:[vehicle],
    drivers:dupe?[driver,{...driver,id:'original-d2',status:'inaktiv'}]:[driver],
    fuelCards:[{id:'synthetic-fuel',history:[]}],
    contacts:[{id:'synthetic-contact',name:'SYNTHETIC CONTACT'}]
  };
}
async function seed(original){
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async ctx=>{
    const elevated=ctx.firestore();
    await setDoc(doc(elevated,'users',uid),{name:'Synthetic admin',active:true,role:'admin'});
    await setDoc(doc(elevated,'flottaMigrationApproval','current'),{
      status:'approved',approvedUid:uid,sourceSha256:sha,
      approvedAt:Timestamp.fromDate(new Date('2026-01-01T00:00:00Z'))
    });
    await setDoc(doc(elevated,'flottaSharedState','current'),original);
    await setDoc(doc(elevated,'drivers','DA0001'),{
      name:'ORIGINAL DRIVER',daCode:'DA0001',vendor:'SYNTHETIC',
      capacity:50,active:true
    });
    await setDoc(doc(elevated,'vehicles','ABC123'),{
      plate:'ABC123',model:'Ford Transit',status:'Elérhető'
    });
    await setDoc(doc(elevated,'driverCapacities','DA0001'),{capacity:50});
  });
}
async function directBooking({driverIndex=0,vehicleIndex=0,mutateFleet}={}){
  return runTransaction(db,async tx=>{
    const [b,c,f]=await Promise.all([
      tx.get(bookingRef),tx.get(claimRef),tx.get(fleetRef)
    ]);
    assert.equal(b.exists(),false);
    assert.equal(c.exists(),false);
    if(mutateFleet)tx.update(fleetRef,mutateFleet(f.data()));
    tx.set(bookingRef,{
      date,driverId:'DA0001',vehicleId:'ABC123',district:'01',
      status:'planned',capacity:50,driverIndex,vehicleIndex
    });
    tx.set(claimRef,{date,driverId:'DA0001',bookingId});
    return true;
  });
}
async function appBooking(){
  return commitCanonicalDepotBooking({
    db,sdk:{doc,runTransaction},uid,getCurrentUid:()=>uid,
    offline:false,booking:{
      date,driverId:'DA0001',vehicleId:'ABC123',district:'01',status:'planned'
    }
  });
}
async function expectNoBooking(label,attempt,pattern=/PERMISSION_DENIED|permission-denied/i){
  await assert.rejects(attempt,e=>{
    assert.match(String(e?.message||e),pattern,label);
    return true;
  });
  assert.equal((await getDoc(bookingRef)).exists(),false,label);
  assert.equal((await getDoc(claimRef)).exists(),false,label);
  console.log('PASS [E] valid DENY: '+label);
}
try{
  // 1: Actual bridge-compatible source with normalized original plate
  // (no hyphen) and active master is a real positive integration case.
  await seed(fleet());
  const ok=await appBooking();
  assert.equal(ok.committed,true);
  assert.equal((await getDoc(bookingRef)).exists(),true);
  console.log('PASS [E] normal eligible original Fleet booking + driverClaim ALLOW');

  // 2: Original Fleet stores plates with hyphens, while Depot canonical
  // IDs are normalized. Current Rules compares raw plate to normalized ID.
  await seed(fleet({plate:'ABC-123'}));
  await expectNoBooking(
    'P0 false-denial: original ABC-123 vs canonical ABC123 active car',
    appBooking
  );
  console.log('PASS [E] P0 BUG original normal hyphenated plate blocks app booking');

  // 3 & 4: Rules must prevent direct authenticated SDK booking against
  // canonical service and inactive masters even if strict mirrors lie.
  await seed(fleet({vehicleStatus:'szerviz'}));
  await expectNoBooking('canonical service car with available strict mirror',directBooking);
  await seed(fleet({driverStatus:'inaktiv'}));
  await expectNoBooking('canonical inactive driver with active strict mirror',directBooking);

  // 5: Negative array index and empty originals must fail closed.
  await seed(fleet({vehicleStatus:'aktiv'}));
  await expectNoBooking('negative master index cannot select a car',
    ()=>directBooking({vehicleIndex:-1}));
  await seed({...fleet(),drivers:[],vehicles:[]});
  await expectNoBooking('empty Fleet canonical masters cannot book',directBooking);

  // 6: Key anomaly. A direct SDK transaction can turn the original vehicle
  // from available to service WHILE booking with get(fleet) prewrite
  // snapshot. Correct atomic Rules must validate getAfter(fleet).
  await seed(fleet());
  const afterService=(current)=>({
    revision:current.revision+1,
    vehicles:[{...current.vehicles[0],status:'szerviz'}]
  });
  assert.equal(await directBooking({mutateFleet:afterService}),true);
  assert.equal((await getDoc(bookingRef)).exists(),true);
  assert.equal((await getDoc(fleetRef)).data().vehicles[0].status,'szerviz');
  console.log('PASS [E] P0 BUG same transaction sets service status AND creates booking');

  // 7: A duplicated original master may supply a legitimate indexed
  // active entry but makes the underlying shared identity ambiguous.
  // A booking should be denied if full canonical original Fleet is invalid.
  await seed(fleet({dupe:true}));
  assert.equal(await directBooking(),true);
  assert.equal((await getDoc(bookingRef)).exists(),true);
  console.log('PASS [E] P0 BUG ambiguous duplicate original DA/plate direct SDK booking accepted');

  console.log('PASS LOCAL #114 adversarial emulator evidence. Unsafe cases mean NO-GO.');
}finally{
  await env.cleanup();
}
