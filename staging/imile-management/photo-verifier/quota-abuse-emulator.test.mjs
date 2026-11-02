import {attachQaAppCheck} from './app-check-client-qa.mjs';
// Targeted follow-on tests. quota-emulator.test.mjs establishes the isolated demo
// policy and fixtures first. No prior successful workflows are rerun locally.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {initializeApp as initAdmin} from 'firebase-admin/app';
import {getFirestore as adminDb,Timestamp} from 'firebase-admin/firestore';
import {getAuth as adminAuth} from 'firebase-admin/auth';
import {initializeApp,deleteApp} from 'firebase/app';
import {getAuth,connectAuthEmulator,signInWithEmailAndPassword,signOut} from 'firebase/auth';
import {getFirestore,connectFirestoreEmulator,doc,updateDoc,setDoc,deleteDoc} from 'firebase/firestore';
import {getStorage,connectStorageEmulator,ref,uploadBytes} from 'firebase/storage';
import {getFunctions,connectFunctionsEmulator,httpsCallable} from 'firebase/functions';
import {assertFails,initializeTestEnvironment} from '@firebase/rules-unit-testing';
import {BUCKET} from './verifier.mjs';
import {counterKeys,dayKey} from './quota-policy.mjs';
for(const [k,p]of [['FIRESTORE_EMULATOR_HOST','127.0.0.1:8888'],['FIREBASE_AUTH_EMULATOR_HOST','127.0.0.1:9398']])assert.equal(process.env[k],p,'LOOPBACK_REQUIRED');
assert.match(process.env.STORAGE_EMULATOR_HOST||'',/^(http:\/\/)?127\.0\.0\.1:9297$/);
const project='demo-imile-quota',a=initAdmin({projectId:project}),db=adminDb(a),auth=adminAuth(a),apps=[];
const env=await initializeTestEnvironment({projectId:project,firestore:{host:'127.0.0.1',port:8888,rules:await fs.readFile(new URL('../../../depokapacitas/firestore.rules',import.meta.url),'utf8')},storage:{host:'127.0.0.1',port:9297,rules:await fs.readFile(new URL('../attendance/storage.rules',import.meta.url),'utf8')}});
const uid='qa_access',driver='SYNDA04',plate='SYN8003',id=()=>randomBytes(16).toString('hex'),reason='SYNTHETIC_TEST jogosultság és visszaélés ellenőrzése';let passed=0;
const check=async(n,fn)=>{await fn();passed++;console.log('PASS '+n);};
const err=(fn,code)=>assert.rejects(fn,e=>e.message?.includes(code));
async function client(u){const app=initializeApp({projectId:project,apiKey:'synthetic-api-key',storageBucket:BUCKET},u);apps.push(app);attachQaAppCheck(app);const auth=getAuth(app);connectAuthEmulator(auth,'http://127.0.0.1:9398',{disableWarnings:true});await signInWithEmailAndPassword(auth,u+'@example.invalid','SYNTHETIC-QUOTA-LOCAL-2026');const firestore=getFirestore(app);connectFirestoreEmulator(firestore,'127.0.0.1',8888);const storage=getStorage(app);connectStorageEmulator(storage,'127.0.0.1',9297);const functions=getFunctions(app,'europe-west3');connectFunctionsEmulator(functions,'127.0.0.1',5108);return {auth,db:firestore,storage,call:async p=>(await httpsCallable(functions,'attendancePhotoPermit')(p)).data};}
const begin=(c,key=id())=>c.call({action:'begin',requestId:key});
const accessRef=db.doc('courierAccess/'+uid);
const used=async()=>(await db.doc('photoUploadQuotas/'+counterKeys(dayKey(Date.now()),uid,driver)[0]).get()).data().used;
try{
 const previous=(await db.doc('drivers/'+driver).get()).data();
 if(previous){
  assert.equal(previous.name,'SYNTHETIC_TEST');assert.equal(previous.daCode,driver);
  // Repeatable cleanup ONLY this explicitly synthetic supplemental fixture,
  // never a runtime quota reset or part of the application API.
  for(const k of counterKeys(dayKey(Date.now()),uid,driver))await db.doc('photoUploadQuotas/'+k).delete();
  await db.doc('photoUploadLeases/'+driver).delete();
 }
 try{await auth.deleteUser(uid);}catch(e){if(e.code!=='auth/user-not-found')throw e;}
 await auth.createUser({uid,email:uid+'@example.invalid',password:'SYNTHETIC-QUOTA-LOCAL-2026'});
 await db.doc('drivers/'+driver).set({daCode:driver,name:'SYNTHETIC_TEST',vendor:'QA',capacity:50,active:true});await accessRef.set({uid,driverId:driver,active:true});
 const c=await client(uid),ad=await client('qa_admin');
 const p=(await db.doc('photoUploadPolicy/current').get()).data();await ad.call({action:'adminPolicy',operationId:id(),expectedRevision:p.revision,policy:{...p,revision:p.revision+1,maxRequestAliases:2},reason});
 const request=id(),grant=await begin(c,request),sid=grant.sessionId;
 const photo=()=>uploadBytes(ref(c.storage,`attendance/${uid}/${sid}/in/front.jpg`),new Uint8Array([255,216,255,217]),{contentType:'image/jpeg'});
 await check('admin may deactivate access without altering its server permit',async()=>{await updateDoc(doc(ad.db,'courierAccess',uid),{active:false});assert.equal((await accessRef.get()).data().photoUploadPermit.sessionId,sid);await err(()=>begin(c,request),'COURIER_DENIED');await assertFails(photo());await updateDoc(doc(ad.db,'courierAccess',uid),{active:true});});
 await check('DA reassignment immediately invalidates stored upload capability',async()=>{await updateDoc(doc(ad.db,'courierAccess',uid),{driverId:'SYNDA02'});await assertFails(photo());await updateDoc(doc(ad.db,'courierAccess',uid),{driverId:driver});});
 await check('inactive canonical driver cannot renew or issue a permit',async()=>{await db.doc('drivers/'+driver).update({active:false});await err(()=>begin(c,request),'DRIVER_INACTIVE');await db.doc('drivers/'+driver).update({active:true});});
 await check('browser admin cannot remove server capability with profile replacement',()=>assertFails(setDoc(doc(ad.db,'courierAccess',uid),{uid,driverId:driver,active:true})));
 await check('browser admin cannot replace permit or change document owner',async()=>{await assertFails(updateDoc(doc(ad.db,'courierAccess',uid),{photoUploadPermit:null}));await assertFails(updateDoc(doc(ad.db,'courierAccess',uid),{uid:'qa_duplicate'}));});
 const quotaKey=counterKeys(dayKey(Date.now()),uid,driver)[0];
 await check('admin browser cannot reset, delete or update server counters',async()=>{await assertFails(updateDoc(doc(ad.db,'photoUploadQuotas',quotaKey),{used:0}));await assertFails(deleteDoc(doc(ad.db,'photoUploadQuotas',quotaKey)));});
 await check('same UID after signout and login resumes original quota and session',async()=>{await signOut(c.auth);await signInWithEmailAndPassword(c.auth,uid+'@example.invalid','SYNTHETIC-QUOTA-LOCAL-2026');assert.equal((await begin(c,request)).sessionId,sid);assert.equal(await used(),1);});
 await check('parallel alias keys remain bounded without extra session charges',async()=>{const r=await Promise.allSettled([begin(c),begin(c)]);assert.equal(r.filter(x=>x.status==='fulfilled').length,1);assert.ok(r.find(x=>x.status==='rejected').reason.message.includes('TOO_MANY_REQUEST_ALIASES'));assert.equal(await used(),1);assert.equal((await begin(c,request)).sessionId,sid);});
 const original=(await accessRef.get()).data().photoUploadPermit;
 await check('in-stage expiry cannot outlive its absolute resume deadline',async()=>{await accessRef.update({photoUploadPermit:{...original,resumeUntil:Timestamp.fromMillis(Date.now()-1)}});await assertFails(photo());await accessRef.update({photoUploadPermit:original});});
 await check('admin can revoke disabled/inactive courier permit, never re-enable it silently',async()=>{
  await auth.updateUser(uid,{disabled:true});await updateDoc(doc(ad.db,'courierAccess',uid),{active:false});
  await ad.call({action:'adminRevoke',operationId:id(),targetUid:uid,sessionId:sid,reason});assert.equal((await accessRef.get()).data().photoUploadPermit.status,'revoked');
  await err(()=>ad.call({action:'adminResume',operationId:id(),targetUid:uid,sessionId:sid,reason}),'ACCOUNT_DENIED');
  await auth.updateUser(uid,{disabled:false});await updateDoc(doc(ad.db,'courierAccess',uid),{active:true});
  await ad.call({action:'adminResume',operationId:id(),targetUid:uid,sessionId:sid,reason});
 });
 // Synthetic corruption fixtures test the full backend lock chain. No photo
 // receipt is faked. None of these sessions can pass client checkin rules.
 await db.doc('vehicleSessions/'+sid).set({uid,driverId:driver,plate,status:'active',syntheticQuotaGuardTest:true});
 await db.doc('courierLocks/'+uid).set({plate,sessionId:sid,state:'active'});
 await db.doc('driverLocks/'+driver).set({uid,driverId:driver,plate,sessionId:sid,state:'active'});
 const out=()=>c.call({action:'checkout',sessionId:sid});
 await check('backend rejects out grant when vehicle lock is missing',()=>err(out,'LOCK_MISMATCH'));
 await db.doc('vehicleLocks/'+plate).set({uid,driverId:'SYNDA02',plate,sessionId:sid,state:'active'});
 await check('backend rejects mismatched vehicle DA even with matching session',()=>err(out,'LOCK_MISMATCH'));
 await db.doc('vehicleLocks/'+plate).update({driverId:driver,uid:'qa_duplicate'});
 await check('backend rejects mismatched vehicle UID',()=>err(out,'LOCK_MISMATCH'));
 await db.doc('vehicleLocks/'+plate).update({uid});await db.doc('driverLocks/'+driver).update({sessionId:'s_'+id()});
 await check('backend rejects mismatched canonical DA lock session',()=>err(out,'LOCK_MISMATCH'));
 await db.doc('driverLocks/'+driver).update({sessionId:sid});
 await check('coherent three-lock chain permits out renewal without new quota',async()=>{assert.equal((await out()).sessionId,sid);assert.equal(await used(),1);});
 const active=(await accessRef.get()).data().photoUploadPermit;
 await accessRef.update({photoUploadPermit:{...active,outExpiresAt:Timestamp.fromMillis(Date.now()-1)}});
 await check('expired out permit is directly denied, then safely renewed',async()=>{await assertFails(uploadBytes(ref(c.storage,`attendance/${uid}/${sid}/out/front.jpg`),new Uint8Array([255,216,255,217]),{contentType:'image/jpeg'}));assert.equal((await out()).sessionId,sid);assert.equal(await used(),1);});
 await check('loss of admin role overrides cached authentication immediately',async()=>{await db.doc('users/qa_admin').update({role:'viewer'});try{await err(()=>ad.call({action:'adminGrant',operationId:id(),targetUid:uid,amount:1,reason}),'ADMIN_REQUIRED');}finally{await db.doc('users/qa_admin').update({role:'admin'});}});
 await check('only explicitly marked synthetic corruption records are cleaned up',async()=>{assert.equal((await db.doc('vehicleSessions/'+sid).get()).data().syntheticQuotaGuardTest,true);const b=db.batch();b.delete(db.doc('vehicleSessions/'+sid));for(const [col,key]of [['vehicleLocks',plate],['courierLocks',uid],['driverLocks',driver]]){const r=db.doc(col+'/'+key),d=(await r.get()).data();assert.equal(d.sessionId,sid);b.delete(r);}await b.commit();await ad.call({action:'adminRevoke',operationId:id(),targetUid:uid,sessionId:sid,reason});});
 console.log('PASS '+passed+' additional authority/lock-chain/abuse emulator scenarios; no cloud writes');
}finally{await Promise.all(apps.map(deleteApp));await env.cleanup();await a.delete();}
