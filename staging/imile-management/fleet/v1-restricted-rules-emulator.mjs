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
const fleetData=(revision)=>({revision,migrationSourceSha256:'f'.repeat(64),vehicles:[{rendszam:'TEST0001',status:'aktiv',normalizedPlate:'TEST0001'}],drivers:[{daCode:'TEST0001',status:'aktiv',kapacitas:50}],fuelCards:[],contacts:[]});
const driver=(id)=>({name:'SYNTHETIC DRIVER',daCode:id,vendor:'SYNTHETIC',
  capacity:50,active:true});
const vehicle=(id)=>({plate:id,model:'SYNTHETIC CAR',status:'Elérhető'});
function bookFuture(date,{vehicleId='TEST0001',driverId='TEST0001',capacity=50,driverIndex=0,vehicleIndex=0}={}){
  const bookingId=date+'__'+vehicleId;
  const b=writeBatch(shared);
  b.set(doc(shared,'bookings',bookingId),{
    date,vehicleId,driverId,district:'1',status:'planned',capacity,
    driverIndex,vehicleIndex
  });
  b.set(doc(shared,'driverClaims',date+'__'+driverId),{
    date,driverId,bookingId
  });
  // The new restricted Rules require BOTH canonical identity claims in the
  // SAME atomic batch. Their index+revision must match the trusted Fleet.
  // This is NOT a global-uniqueness proof: the #133 hostile SDK tests remain.
  b.set(doc(shared,'flottaDriverClaims',driverId),{sourceIndex:driverIndex,revision:2});
  b.set(doc(shared,'flottaVehicleClaims',vehicleId),{sourceIndex:vehicleIndex,revision:2});
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
    const source=ctx.firestore();
    await setDoc(fleet(source),fleetData(1));
    // Trusted migration must seed canonical keyed sources BEFORE any booking.
    // Never manufacture them in the booking batch.
    await setDoc(doc(source,'flottaDrivers','TEST0001'),{
      daCode:'TEST0001',status:'aktiv',kapacitas:50,
      history:[{note:'original rich driver'}],name:'Synthetic Migrated Driver'
    });
    await setDoc(doc(source,'flottaVehicles','TEST0001'),{
      rendszam:'TEST0001',status:'aktiv',
      history:[{note:'original rich vehicle'}],modell:'Synthetic Car'
    });
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
  const realDAClaim=await getDoc(doc(shared,'flottaDriverClaims','TEST0001'));
  const realPlateClaim=await getDoc(doc(shared,'flottaVehicleClaims','TEST0001'));
  assert.equal(realDAClaim.exists(),true,'DA claim must be committed atomically');
  assert.equal(realPlateClaim.exists(),true,'Plate claim must be committed atomically');
  assert.deepEqual(realDAClaim.data(),{sourceIndex:0,revision:2});
  assert.deepEqual(realPlateClaim.data(),{sourceIndex:0,revision:2});
  // Valid plate normalization survives a hyphen in the canonical original.
  await env.withSecurityRulesDisabled(ctx=>
    setDoc(fleet(ctx.firestore()),{...fleetData(2),
      vehicles:[{rendszam:'TEST-0001',status:'aktiv',normalizedPlate:'TEST0001'}]}));
  await expectPermission('original plate with hyphen is eligible after Rules normalization',true,
    ()=>bookFuture('2099-01-06'));
  // Forging the browser-owned normalizedPlate cannot book a different car.
  await env.withSecurityRulesDisabled(ctx=>
    setDoc(fleet(ctx.firestore()),{...fleetData(2),
      vehicles:[{rendszam:'OTHER001',status:'aktiv',normalizedPlate:'TEST0001'}]}));
  await expectPermission('forged normalizedPlate cannot authorize a different original plate',false,
    ()=>bookFuture('2099-01-07'));
  await env.withSecurityRulesDisabled(ctx=>setDoc(fleet(ctx.firestore()),fleetData(2)));
  // Canonical Fleet capacity must work when old Depot drivers/capacity mirrors
  // do not exist. These records are intentionally removed only in the emulator.
  await env.withSecurityRulesDisabled(async ctx=>{
    const db=ctx.firestore();
    await deleteDoc(doc(db,'driverCapacities','TEST0001'));
    await deleteDoc(doc(db,'drivers','TEST0001'));
  });
  await expectPermission('Fleet kapacitas permits booking without any legacy Depot driver mirror',true,
    ()=>bookFuture('2099-01-08'));
  await env.withSecurityRulesDisabled(async ctx=>{
    const db=ctx.firestore();
    await setDoc(doc(db,'driverCapacities','TEST0001'),{capacity:50});
    await setDoc(doc(db,'drivers','TEST0001'),driver('TEST0001'));
  });
  // L3: non-ASCII lookalikes must not normalize into an authorized ASCII plate.
  await env.withSecurityRulesDisabled(ctx=>setDoc(fleet(ctx.firestore()),{
    ...fleetData(2),
    vehicles:[{rendszam:'TEST\u01310001',normalizedPlate:'TESTI0001',status:'aktiv'}]
  }));
  await expectPermission('Unicode dotless-i plate may not impersonate TESTI0001',false,
    ()=>bookFuture('2099-01-12',{vehicleId:'TESTI0001'}));
  await env.withSecurityRulesDisabled(ctx=>setDoc(fleet(ctx.firestore()),fleetData(2)));
  // L4: an editor-writable deprecated mirror cannot inflate canonical capacity.
  await expectPermission('legacy capacity mirror can be changed but never authorizes larger booking',true,
    ()=>updateDoc(doc(shared,'driverCapacities','TEST0001'),{capacity:500}));
  await expectPermission('forged mirror capacity 500 cannot book a Fleet-50 courier',false,
    ()=>bookFuture('2099-01-13',{capacity:500}));
  await expectPermission('Fleet kapacitas 50 remains bookable even if legacy mirror says 500',true,
    ()=>bookFuture('2099-01-13',{capacity:50}));
  // L4: absent canonical capacity must DENY rather than silently become zero.
  await env.withSecurityRulesDisabled(ctx=>setDoc(fleet(ctx.firestore()),{
    ...fleetData(2),drivers:[{daCode:'TEST0001',status:'aktiv'}]
  }));
  await expectPermission('missing canonical driver capacity cannot be manufactured by mirror or zero',false,
    ()=>bookFuture('2099-01-14',{capacity:0}));
  await env.withSecurityRulesDisabled(async ctx=>{
    await setDoc(fleet(ctx.firestore()),fleetData(2));
    await setDoc(doc(ctx.firestore(),'driverCapacities','TEST0001'),{capacity:50});
  });
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
