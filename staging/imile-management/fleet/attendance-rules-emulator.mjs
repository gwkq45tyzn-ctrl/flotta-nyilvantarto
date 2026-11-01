// Firebase FIRESTORE EMULATOR ONLY; synthetic identities, no staging writes.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import {doc,setDoc,getDoc,getDocs,collection,writeBatch,serverTimestamp,updateDoc,deleteDoc} from 'firebase/firestore';
const rules=await fs.readFile(new URL('../../../depokapacitas/firestore.rules',import.meta.url),'utf8');
const env=await initializeTestEnvironment({projectId:'demo-attendance-own',firestore:{host:'127.0.0.1',port:8787,rules}});
const uid='courier_123',otherUid='courier_456',driver='DAX001',otherDriver='DAX002',plate='CAR00001',plate2='CAR00002';
const sid='s_'+'a'.repeat(32),sid2='s_'+'b'.repeat(32),sid3='s_'+'c'.repeat(32);
const db={courier:env.authenticatedContext(uid).firestore(),other:env.authenticatedContext(otherUid).firestore(),
 editor:env.authenticatedContext('editor').firestore(),viewer:env.authenticatedContext('viewer').firestore(),
 admin:env.authenticatedContext('admin').firestore(),anonymous:env.unauthenticatedContext().firestore()};
const photos=(user,id,stage)=>Object.fromEntries(['front','left','right','back','cabinFront','cabinRear','cargo'].map(k=>[k,'attendance/'+user+'/'+id+'/'+stage+'/'+k+'.jpg']));
const session=(user,id,driverId,car)=>({uid:user,driverId,plate:car,status:'active',startKm:100,endKm:null,inPhotos:photos(user,id,'in'),outPhotos:{},damageNote:'',startedAt:serverTimestamp(),endedAt:null,reviewedAt:null,reviewedBy:''});
const create=(database,user,id,driverId,car,s={})=>{const batch=writeBatch(database);
batch.set(doc(database,'vehicleSessions',id),{...session(user,id,driverId,car),...s});
batch.set(doc(database,'vehicleLocks',car),{plate:car,uid:user,driverId,sessionId:id,state:'active'});
batch.set(doc(database,'courierLocks',user),{plate:car,sessionId:id,state:'active'});
return batch.commit();};
const checkout=(database,user,id,car)=>{const batch=writeBatch(database);
batch.update(doc(database,'vehicleSessions',id),{status:'awaiting_review',endKm:150,outPhotos:photos(user,id,'out'),damageNote:'',endedAt:serverTimestamp()});
batch.update(doc(database,'vehicleLocks',car),{state:'awaiting_review'});
batch.update(doc(database,'courierLocks',user),{state:'awaiting_review'});
return batch.commit();};
const review=(database,user,id,car)=>{const batch=writeBatch(database);
batch.update(doc(database,'vehicleSessions',id),{status:'reviewed',reviewedAt:serverTimestamp(),reviewedBy:'editor'});
batch.delete(doc(database,'vehicleLocks',car));batch.delete(doc(database,'courierLocks',user));
return batch.commit();};
let passed=0;
const test=async(name,yes,fn)=>{console.log('RUN '+name);if(yes)await assertSucceeds(fn());else await assertFails(fn());passed++;};
try{
 await env.clearFirestore();
 await env.withSecurityRulesDisabled(async ctx=>{
  const d=ctx.firestore();
  for(const role of ['admin','editor','viewer'])await setDoc(doc(d,'users',role),{name:'Synthetic',role,active:true});
  for(const [id,code] of [[uid,driver],[otherUid,otherDriver]]){
   await setDoc(doc(d,'courierAccess',id),{uid:id,driverId:code,active:true});
   await setDoc(doc(d,'drivers',code),{name:'Synthetic',daCode:code,vendor:'QA',capacity:50,active:true});
  }
  for(const p of [plate,plate2])await setDoc(doc(d,'vehicles',p),{plate:p,model:'Synthetic',status:'Elérhető'});
 });
 await test('courier read own access',true,()=>getDoc(doc(db.courier,'courierAccess',uid)));
 await test('courier cannot read other access',false,()=>getDoc(doc(db.courier,'courierAccess',otherUid)));
 await test('courier read available vehicles',true,()=>getDocs(collection(db.courier,'vehicles')));
 await test('courier blocked from internal driver data',false,()=>getDocs(collection(db.courier,'drivers')));
 await test('anonymous cannot read vehicles',false,()=>getDocs(collection(db.anonymous,'vehicles')));
 await test('unauthorized fleet edit denied',false,()=>setDoc(doc(db.courier,'vehicles',plate),{plate,model:'Fake',status:'Elérhető'}));
 await test('incomplete 7 photos denied',false,()=>create(db.courier,uid,sid,driver,plate,{inPhotos:{front:'fake'}}));
 await env.withSecurityRulesDisabled(async ctx=>{
  const d=ctx.firestore();
  await setDoc(doc(d,'fleetAssignments',plate2),{vehicleId:plate2,driverId:driver,active:true,mileage:100,operationId:'SYNTHETICFLEETISSUE'});
  await setDoc(doc(d,'fleetDriverAssignments',driver),{vehicleId:plate2,driverId:driver,active:true,mileage:100,operationId:'SYNTHETICFLEETISSUE'});
 });
 await test('self checkin blocked by existing physical Fleet checkout',false,()=>create(db.courier,uid,sid3,driver,plate2));
 await env.withSecurityRulesDisabled(async ctx=>{
  const d=ctx.firestore();
  await updateDoc(doc(d,'fleetAssignments',plate2),{active:false});
  await updateDoc(doc(d,'fleetDriverAssignments',driver),{active:false});
 });
 await test('authenticated courier can atomically check in',true,()=>create(db.courier,uid,sid,driver,plate));
 await test('another courier cannot take occupied car',false,()=>create(db.other,otherUid,sid2,otherDriver,plate));
 await test('same courier cannot take second vehicle',false,()=>create(db.courier,uid,sid2,driver,plate2));
 await test('courier cannot directly release lock',false,()=>deleteDoc(doc(db.courier,'vehicleLocks',plate)));
 await test('other courier cannot view private session',false,()=>getDoc(doc(db.other,'vehicleSessions',sid)));
 await test('courier can read own session query',true,()=>getDocs(collection(db.courier,'vehicleLocks')));
 await test('staff can inspect all sessions',true,()=>getDocs(collection(db.editor,'vehicleSessions')));
 const schedule={date:'2026-11-02',driverId:driver,status:'planned',changedAt:serverTimestamp(),changedBy:'editor'};
 await test('editor can plan company driver without preassigned car',true,()=>setDoc(doc(db.editor,'courierDayPlans','2026-11-02__'+driver),schedule));
 await test('viewer cannot change courier schedule',false,()=>setDoc(doc(db.viewer,'courierDayPlans','2026-11-02__'+driver),{...schedule,changedBy:'viewer'}));
 await test('courier cannot edit scheduling',false,()=>setDoc(doc(db.courier,'courierDayPlans','2026-11-02__'+driver),{...schedule,changedBy:uid}));
 await test('invalid date blocked on schedule',false,()=>setDoc(doc(db.editor,'courierDayPlans','2026-11-31__'+driver),{...schedule,date:'2026-11-31'}));
 await test('editor may confirm presence',true,()=>updateDoc(doc(db.editor,'courierDayPlans','2026-11-02__'+driver),{status:'confirmed',changedAt:serverTimestamp(),changedBy:'editor'}));

 await test('viewer cannot checkout courier vehicle',false,()=>checkout(db.viewer,uid,sid,plate));
 await test('courier cannot fake review',false,()=>review(db.courier,uid,sid,plate));
 await test('courier can atomically check out',true,()=>checkout(db.courier,uid,sid,plate));
 await test('checkout does not release car',false,()=>create(db.other,otherUid,sid2,otherDriver,plate));
 await test('courier cannot check out twice',false,()=>checkout(db.courier,uid,sid,plate));
 await test('editor cannot return without releasing locks',false,()=>updateDoc(doc(db.editor,'vehicleSessions',sid),{status:'reviewed',reviewedAt:serverTimestamp(),reviewedBy:'editor'}));
 await test('viewer cannot approve return',false,()=>{const batch=writeBatch(db.viewer);batch.update(doc(db.viewer,'vehicleSessions',sid),{status:'reviewed',reviewedAt:serverTimestamp(),reviewedBy:'viewer'});batch.delete(doc(db.viewer,'vehicleLocks',plate));batch.delete(doc(db.viewer,'courierLocks',uid));return batch.commit();});
 await test('editor can atomically confirm physical return',true,()=>review(db.editor,uid,sid,plate));
 await test('returned car available for next authenticated courier',true,()=>create(db.other,otherUid,sid2,otherDriver,plate));
 await test('reviewed session history cannot be deleted',false,()=>deleteDoc(doc(db.admin,'vehicleSessions',sid)));
 await test('courier cannot overwrite last history',false,()=>updateDoc(doc(db.courier,'vehicleSessions',sid),{startKm:0}));
 await test('another car can be checked out only after previous review',true,()=>create(db.courier,uid,sid3,driver,plate2));
 assert.equal((await getDoc(doc(db.editor,'vehicleSessions',sid))).data().status,'reviewed');
 console.log('PASS: '+passed+' self-service courier and manager check-out security scenarios');
}finally{await env.cleanup();}
