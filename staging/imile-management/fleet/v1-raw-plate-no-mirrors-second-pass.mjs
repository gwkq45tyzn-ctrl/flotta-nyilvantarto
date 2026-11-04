/**
 * Independent REAL SDK + Rules emulator tests on Grok V1 #114
 * frozen source SHA 1edd3e3f4299e8514094217a3d5e6849549edeb2.
 * All test data are synthetic and demo-project only. A PASS marked "BUG"
 * means a release-blocking failure was proven, not a successful fix.
 */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import {doc,getDoc,setDoc,updateDoc,runTransaction,Timestamp} from 'firebase/firestore';
import {commitCanonicalDepotBooking} from '../../../depokapacitas/canonical-booking-transaction.mjs';
import {assessCanonicalMasterDisplay} from '../../../depokapacitas/canonical-source-health.mjs';
const uid='synthetic-imile-v1-admin-0000001',email='imilemanagement@imile-management-staging.firebaseapp.com';
const sha='f'.repeat(64),day='2099-06-15';
const txt=await readFile(new URL('../../../depokapacitas/firestore-v1-restricted.rules',import.meta.url),'utf8');
assert.ok(txt.includes('REPLACE_WITH_REAL_SHARED_UID'));
const env=await initializeTestEnvironment({
 projectId:'demo-imile-restricted-v1',
 firestore:{host:'127.0.0.1',port:8787,rules:txt.replaceAll('REPLACE_WITH_REAL_SHARED_UID',uid)}
});
const db=env.authenticatedContext(uid,{email}).firestore();
const fref=doc(db,'flottaSharedState','current'),dref=doc(db,'drivers','DA0001');
const vref=doc(db,'vehicles','ABC123');
const approvalRef=doc(db,'flottaMigrationApproval','current');
const bookingRef=doc(db,'bookings',day+'__ABC123');
const claimRef=doc(db,'driverClaims',day+'__DA0001');
function original({plate='ABC-123',status='aktiv',driverStatus='aktiv',duplicates=false}={}){
 const v={id:'orig-car-1',rendszam:plate,gyartmany:'Ford',modell:'Transit',status,
          history:[{event:'SYNTHETIC SERVICE',when:'2099-01-01'}]};
 const d={id:'orig-driver-1',daCode:'DA0001',name:'Test Driver',agency:'SYNTHETIC',
          kapacitas:50,status:driverStatus,history:[{event:'SYNTHETIC ASSIGNMENT'}]};
 return {revision:1,migrationSourceSha256:sha,
 vehicles:duplicates?[v,{...v,id:'orig-car-2',status:'szerviz'}]:[v],
 drivers:duplicates?[d,{...d,id:'orig-driver-2',status:'inaktiv'}]:[d],
 fuelCards:[{id:'card-1',history:[{amount:1}]}],
 contacts:[{id:'contact-1',name:'SYNTHETIC'}]};
}
const approval={status:'approved',approvedUid:uid,sourceSha256:sha,
 approvedAt:Timestamp.fromDate(new Date('2026-01-01T00:00:00Z'))};
async function seed({fleet=original(),mirrors=true,mirrorVehicleStatus='Elérhető',mirrorDriverActive=true}={}){
 await env.clearFirestore();
 await env.withSecurityRulesDisabled(async ctx=>{
  const root=ctx.firestore();
  await setDoc(doc(root,'users',uid),{name:'SYNTHETIC',active:true,role:'admin'});
  await setDoc(doc(root,'flottaMigrationApproval','current'),approval);
  await setDoc(doc(root,'flottaSharedState','current'),fleet);
  await setDoc(doc(root,'driverCapacities','DA0001'),{capacity:50});
  if(mirrors){
   await setDoc(doc(root,'drivers','DA0001'),{name:'Test Driver',daCode:'DA0001',
       vendor:'SYNTHETIC',capacity:50,active:mirrorDriverActive});
   await setDoc(doc(root,'vehicles','ABC123'),{plate:'ABC123',
       model:'Ford Transit',status:mirrorVehicleStatus});
  }
 });
}
const app=()=>commitCanonicalDepotBooking({db,sdk:{doc,runTransaction},
 uid,getCurrentUid:()=>uid,offline:false,
 booking:{date:day,driverId:'DA0001',vehicleId:'ABC123',district:'01',status:'planned'}});
const direct=(edit=null)=>runTransaction(db,async tx=>{
 const [book,claim,fleet]=await Promise.all([tx.get(bookingRef),tx.get(claimRef),tx.get(fref)]);
 assert.equal(book.exists(),false);
 assert.equal(claim.exists(),false);
 if(edit)tx.update(fref,edit(fleet.data()));
 tx.set(bookingRef,{date:day,driverId:'DA0001',vehicleId:'ABC123',
   district:'01',status:'planned',capacity:50,driverIndex:0,vehicleIndex:0});
 tx.set(claimRef,{date:day,driverId:'DA0001',bookingId:day+'__ABC123'});
 return true;
});
async function deny(label,fn,pattern=/PERMISSION_DENIED|permission-denied/){
 await assert.rejects(fn,e=>{assert.match(String(e?.message||e),pattern,label);return true;});
 assert.equal((await getDoc(bookingRef)).exists(),false,label+' no booking created');
 assert.equal((await getDoc(claimRef)).exists(),false,label+' no driver claim created');
 console.log('PASS [E] EXPECTED DENY '+label);
}
try{
 // 1: Existing common raw original plate is "ABC-123"; Depot ID is "ABC123".
 await seed();
 await deny('P0 BUG original hyphenated plate is incorrectly refused',
   app,/PERMISSION_DENIED|permission-denied/);
 console.log('PASS [E] P0 BUG raw ABC-123 -> normalized ABC123 valid booking unavailable');

 // 2: Without hyphen, same original app and Rules do create a booking.
 await seed({fleet:original({plate:'ABC123'})});
 assert.equal((await app()).committed,true);
 assert.equal((await getDoc(bookingRef)).exists(),true);
 console.log('PASS [E] valid unhyphenated original Fleet app booking + claim ALLOW');

 // 3: New getAfter still denies status-flip and booking in one transaction.
 await seed({fleet:original({plate:'ABC123'})});
 await deny('post-transaction car service must stop booking',
   ()=>direct(old=>({revision:old.revision+1,
      vehicles:[{...old.vehicles[0],status:'szerviz'}]})));
 console.log('PASS [E] fixed atomic service+booking bypass');

 // 4: Real direct SDK does not trust client gate with an ineligible original.
 await seed({fleet:original({plate:'ABC123',status:'szerviz'})});
 await deny('original canonical service vehicle direct SDK',direct);
 await seed({fleet:original({plate:'ABC123',driverStatus:'inaktiv'})});
 await deny('original inactive driver direct SDK',direct);

 // 5: Removing mirror WRITES without removing mirror RULES makes booking fail.
 await seed({fleet:original({plate:'ABC123'}),mirrors:false});
 const t=Date.now();
 const sourceMeta=Object.fromEntries(
  ['drivers','vehicles','flottaSharedState','flottaMigrationApproval']
    .map(key=>[key,{loaded:true,fromCache:false,pending:false,error:false,serverAt:t}])
 );
 const health=assessCanonicalMasterDisplay({
    fleet:(await getDoc(fref)).data(),approval:(await getDoc(approvalRef)).data(),uid,
    driverMirrors:[],vehicleMirrors:[],sourceMeta,online:true,now:t
 });
 assert.equal(health.trusted,true);
 assert.equal(health.drivers.length,1);
 assert.equal(health.vehicles.length,1);
 await deny('P0 BUG Fleet-only UI shows available car but Rules require deleted mirrors',
   app,/PERMISSION_DENIED|permission-denied/);
 console.log('PASS [E] P0 BUG authentic Fleet-only visible masters but booking denied');

 // 6: Strict mirrors are no longer edited by normal Fleet saves.
 // Even if an old mirror marks service, the canonical available vehicle cannot book.
 await seed({fleet:original({plate:'ABC123'}),mirrorVehicleStatus:'Szerviz'});
 await deny('P0 BUG a stale service mirror defeats live canonical available car',
   app,/PERMISSION_DENIED|permission-denied/);
 console.log('PASS [E] P0 BUG Fleet status restored available but stale mirror blocks');

 // 7: One indexed selected source record does not establish uniqueness.
 await seed({fleet:original({plate:'ABC123',duplicates:true})});
 assert.equal(await direct(),true);
 assert.equal((await getDoc(bookingRef)).exists(),true);
 console.log('PASS [E] P0 BUG duplicate original IDs still bookable via raw SDK');

 // 8: Even with canonical only bridge, a raw SDK actor can mutate mirrors
 // in one Fleet revision transaction, as Rules don't validate their parity.
 await seed({fleet:original({plate:'ABC123'})});
 await runTransaction(db,async tx=>{
   const before=await tx.get(fref);
   tx.update(fref,{revision:before.data().revision+1});
   tx.set(dref,{name:'FAKE MIRROR NAME',daCode:'DA0001',
        vendor:'SYNTHETIC',capacity:50,active:true});
 });
 assert.equal((await getDoc(dref)).data().name,'FAKE MIRROR NAME');
 assert.equal((await getDoc(fref)).data().drivers[0].name,'Test Driver');
 console.log('PASS [E] P0 BUG server still allows forged /drivers mirror + revision bump');

 console.log('PASS genuine local #114 S7 QA adversarial results: still NO-GO');
}finally{await env.cleanup();}
