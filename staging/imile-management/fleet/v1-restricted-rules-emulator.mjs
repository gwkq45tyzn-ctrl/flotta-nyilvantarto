/**
 * Full V1 security boundary on actual Firestore emulator, not a static scan.
 * Node 24; run via Firebase emulators:exec --only firestore on demo project.
 * The real shared UID is NEVER read or published. A synthetic UID replaces
 * its not-deployable placeholder in memory for authorization tests only.
 */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import {collection,doc,getDoc,getDocs,setDoc,updateDoc,deleteDoc} from 'firebase/firestore';

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
const fleetData=(revision)=>({revision,vehicles:[],drivers:[],fuelCards:[],contacts:[]});
const driver=(id)=>({name:'SYNTHETIC DRIVER',daCode:id,vendor:'SYNTHETIC',
  capacity:50,active:true});
const vehicle=(id)=>({plate:id,model:'SYNTHETIC CAR',status:'Elérhető'});
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
  ['flottaSharedState','current']
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
    'performanceDays','inventoryDays','courierDayPlans','flottaSharedState'
  ]){
    const id=collection==='users'?uid:collection==='flottaSharedState'?'current':'SYNTH1';
    await expectPermission('valid shared can get '+collection,true,
      ()=>getDoc(doc(shared,collection,id)));
  }
  await expectPermission('shared admin create driver',true,
    ()=>setDoc(doc(shared,'drivers','TEST0001'),driver('TEST0001')));
  await expectPermission('shared admin create vehicle',true,
    ()=>setDoc(doc(shared,'vehicles','TEST0001'),vehicle('TEST0001')));
  await expectPermission('shared admin can create Fleet snapshot',true,
    ()=>setDoc(fleet(shared),fleetData(1)));
  await expectPermission('shared admin increments revision',true,
    ()=>updateDoc(fleet(shared),{revision:2}));
  await expectPermission('stale Fleet revision fails',false,
    ()=>updateDoc(fleet(shared),{revision:2}));
  await expectPermission('skipped Fleet revision fails',false,
    ()=>updateDoc(fleet(shared),{revision:4}));
  await expectPermission('cannot delete Fleet snapshot',false,
    ()=>deleteDoc(fleet(shared)));

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
    const id=collection==='users'?uid:collection==='flottaSharedState'?'current':'SYNTH1';
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
