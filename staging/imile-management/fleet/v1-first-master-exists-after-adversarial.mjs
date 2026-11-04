/**
 * S7 first-master getAfter Rules failure evidence.
 * REAL Firestore SDK and isolated local Firestore Emulator, synthetic data.
 * 
 * Proves:
 * 1. existsAfter() means exists in resulting state, NOT necessarily written
 *    in this transaction. So Fleet-only update can pass when mirrors exist.
 * 2. First-item guard fails if Fleet arrays are empty.
 * 3. Original Fleet hyphenated plates do not match strict normalized Doc IDs.
 * 4. Only checking the first master cannot cover the remaining masters.
 *
 * Tests confirm NO-GO witnesses; no real Firebase deploy/data.
 */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import {doc,setDoc,getDoc,updateDoc,runTransaction,Timestamp} from 'firebase/firestore';

const UID='synthetic-imile-v1-admin-0000001',SOURCE_SHA='b'.repeat(64);
const rules=(await readFile(new URL('../../../depokapacitas/firestore-v1-restricted.rules',import.meta.url),'utf8'))
 .replaceAll('REPLACE_WITH_REAL_SHARED_UID',UID);
const env=await initializeTestEnvironment({
 projectId:'demo-imile-restricted-v1',
 firestore:{host:'127.0.0.1',port:8787,rules}
});
const db=env.authenticatedContext(UID,{
 email:'imilemanagement@imile-management-staging.firebaseapp.com'
}).firestore();
const fleetRef=doc(db,'flottaSharedState','current');
const drivers=(name='Synthetic Driver')=>[
 {id:'v-driver-1',daCode:'DA0001',name,agency:'SYNTHETIC',
  status:'aktiv',kapacitas:50,history:[{label:'PRIVATE TEST HISTORY'}]},
 {id:'v-driver-2',daCode:'DA0002',name:'Second Driver',agency:'SYNTHETIC',
  status:'aktiv',kapacitas:40,history:[{label:'SECOND PRIVATE TEST HISTORY'}]}
];
const vehicles=(plate='ABC123')=>[
 {id:'fleet-vehicle-one',rendszam:plate,gyartmany:'Ford',modell:'Transit',
  status:'aktiv',history:[{service:'PRIVATE SYNTHETIC SERVICE'}]},
 {id:'fleet-vehicle-two',rendszam:'XYZ999',gyartmany:'Ford',modell:'Focus',
  status:'aktiv',history:[{service:'PRIVATE OTHER SERVICE'}]}
];
const snapshot=(opts={})=>({
 revision:1,migrationSourceSha256:SOURCE_SHA,
 vehicles:opts.vehicles??vehicles(),
 drivers:opts.drivers??drivers(),
 fuelCards:[{id:'synthetic-card',events:[{event:'fuel'}]}],
 contacts:[{id:'synthetic-contact'}]
});
const dd=(id,name)=>({
 name,daCode:id,vendor:'SYNTHETIC',capacity:id==='DA0002'?40:50,active:true
});
const vv=(id,model)=>({plate:id,model,status:'Elérhető'});
async function seed(fleet){
 await env.clearFirestore();
 await env.withSecurityRulesDisabled(async ctx=>{
  const z=ctx.firestore();
  await setDoc(doc(z,'users',UID),{name:'SYNTHETIC',active:true,role:'admin'});
  await setDoc(doc(z,'flottaMigrationApproval','current'),{
   status:'approved',sourceSha256:SOURCE_SHA,approvedUid:UID,
   approvedAt:Timestamp.fromDate(new Date('2026-01-01T00:00:00Z'))
  });
  await setDoc(doc(z,'flottaSharedState','current'),fleet);
  for(const d of fleet.drivers){
   await setDoc(doc(z,'drivers',d.daCode),dd(d.daCode,d.name));
  }
  for(const v of fleet.vehicles){
   const id=v.rendszam.replace(/[\s-]/g,'').toUpperCase();
   await setDoc(doc(z,'vehicles',id),vv(id,[v.gyartmany,v.modell].join(' ')));
  }
 });
}
async function denied(label,work){
 try{await work();throw Error('UNEXPECTED_SUCCESS '+label);}
 catch(e){
  if(e.message?.startsWith('UNEXPECTED_SUCCESS'))throw e;
  assert.equal(e.code,'permission-denied',label+': '+String(e.message));
  console.log('PASS [E] EXPECTED DENIAL '+label);
 }
}
try {
 // A valid original Fleet with NO master rows cannot update at all because
 // request.resource.data.drivers[0] / vehicles[0] does not exist.
 await seed(snapshot({drivers:[],vehicles:[]}));
 await denied('empty original Fleet arrays: history-only save becomes impossible',
  ()=>updateDoc(fleetRef,{revision:2,contacts:[{id:'new-contact'}]}));
 console.log('PASS [E] P0 NO-GO witness: list index 0 breaks empty Fleet');

 // Both mirrors ALREADY exist, so existsAfter() succeeds without ANY mirror
 // write. A real authenticated Fleet-only update is therefore allowed.
 await seed(snapshot());
 const before=(await getDoc(fleetRef)).data();
 await updateDoc(fleetRef,{revision:2,
  drivers:[{...before.drivers[0],name:'NEW ORIGINAL NAME'},before.drivers[1]]});
 const after=(await getDoc(fleetRef)).data();
 const oldMirror=(await getDoc(doc(db,'drivers','DA0001'))).data();
 assert.equal(after.drivers[0].name,'NEW ORIGINAL NAME');
 assert.equal(oldMirror.name,'Synthetic Driver',
  'Rules did NOT require any mirror write; existsAfter just saw the old doc');
 assert.deepEqual(after.vehicles[0].history,before.vehicles[0].history);
 assert.deepEqual(after.fuelCards,before.fuelCards);
 console.log('PASS [E] P0 NO-GO witness: solo Fleet edit succeeded, mirror remains stale');

 // The first driver is untouched; the second changes. The first doc remains
 // present and fulfills the only-index-0 guard. No master projection required.
 await seed(snapshot());
 await updateDoc(fleetRef,{revision:2,drivers:[
  drivers()[0],{...drivers()[1],name:'SECOND DRIVER CHANGED IN FLEET ONLY'}
 ]});
 assert.equal((await getDoc(fleetRef)).data().drivers[1].name,
  'SECOND DRIVER CHANGED IN FLEET ONLY');
 assert.equal((await getDoc(doc(db,'drivers','DA0002'))).data().name,
  'Second Driver');
 console.log('PASS [E] P0 NO-GO witness: second master drift allowed by first-only existsAfter guard');

 // Original user Fleet plate form ABC-123 is normalized to strict doc
 // ABC123. Rules reference vehicles/ABC-123 (raw), so even a correct atomic
 // transaction cannot satisfy their existsAfter() condition.
 await seed(snapshot({vehicles:vehicles('ABC-123')}));
 await denied('valid hyphenated original plate blocks correct atomic projection',
  ()=>runTransaction(db,async tx=>{
   const latest=await tx.get(fleetRef);
   tx.update(fleetRef,{revision:latest.data().revision+1,
    drivers:[{...latest.data().drivers[0],name:'ATOMIC CORRECT'},latest.data().drivers[1]]});
   tx.set(doc(db,'drivers','DA0001'),dd('DA0001','ATOMIC CORRECT'));
   tx.set(doc(db,'vehicles','ABC123'),vv('ABC123','Ford Transit'));
  }));
 assert.equal((await getDoc(fleetRef)).data().revision,1);
 assert.equal((await getDoc(doc(db,'drivers','DA0001'))).data().name,'Synthetic Driver');
 console.log('PASS [E] P0 NO-GO witness: correct normalized multi-write transaction rejected');
 console.log('PASS LOCAL S7 first-master getAfter adversarial: four genuine emulator NO-GO witnesses');
} finally {
 await env.cleanup();
}
