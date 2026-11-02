// Real Auth/Firestore/Storage + Functions emulators, synthetic identities only.
// Fail closed before any SDK initialization if a loopback dependency is missing.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import sharp from 'sharp';
import {initializeApp as adminApp} from 'firebase-admin/app';
import {getFirestore as adminDb} from 'firebase-admin/firestore';
import {getAuth as adminAuth} from 'firebase-admin/auth';
import {getStorage as adminStorage} from 'firebase-admin/storage';
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing';
import {initializeApp,deleteApp} from 'firebase/app';
import {getAuth,connectAuthEmulator,signInWithEmailAndPassword} from 'firebase/auth';
import {getFirestore,connectFirestoreEmulator,doc,getDoc,getDocs,collection,writeBatch,serverTimestamp} from 'firebase/firestore';
import {getStorage,connectStorageEmulator,ref,uploadBytes,getBytes,deleteObject} from 'firebase/storage';
import {BUCKET,KEYS,pathsFor,verifyEvent} from './verifier.mjs';
import {serverAdapters} from './adapters.mjs';
import {initialVehicleDetails} from '../fleet/operations-data.mjs';
import {attendanceDailyReport} from '../attendance/daily-report.mjs';
import {fleetSummary,bulkReviewEligible} from '../attendance/core.mjs';
import {readVerifiedPhoto} from '../attendance/photo-proof.mjs';
const project='demo-imile-photo';
for(const k of ['FIRESTORE_EMULATOR_HOST','FIREBASE_AUTH_EMULATOR_HOST','STORAGE_EMULATOR_HOST'])
 assert.match(process.env[k]||'',/^(http:\/\/)?127\.0\.0\.1:\d+$/,'LOOPBACK_REQUIRED '+k);
const app=adminApp({projectId:project,storageBucket:BUCKET}),db=adminDb(app),auth=adminAuth(app),bucket=adminStorage(app).bucket();
const env=await initializeTestEnvironment({projectId:project,firestore:{host:'127.0.0.1',port:8788,rules:await fs.readFile(new URL('../../../depokapacitas/firestore.rules',import.meta.url),'utf8')},storage:{host:'127.0.0.1',port:9198,rules:await fs.readFile(new URL('../attendance/storage.rules',import.meta.url),'utf8')}});
const clients=[];let passed=0;
const check=async(name,fn)=>{await fn();passed++;console.log('PASS '+name);};
const uid='synthetic_courier',other='synthetic_other',plate='SYN9001',plate2='SYN9002',driver='SYNDA01',driver2='SYNDA02';
const sid='s_'+'a'.repeat(32),sid2='s_'+'b'.repeat(32),sid3='s_'+'c'.repeat(32);
const receipt=(u,s,stage)=>db.doc(`photoReceipts/${u}/sessions/${s}/stages/${stage}`);
const jpeg=await sharp({create:{width:64,height:48,channels:3,background:'#125684'}}).jpeg().toBuffer();
const adapters=serverAdapters(app);
const direct=(u,s,stage)=>verifyEvent({data:{bucket:BUCKET,name:pathsFor({uid:u,sessionId:s,stage}).front}},adapters);
const waitProof=async(u,s,stage)=>{
 const deadline=Date.now()+45000;
 while(Date.now()<deadline){const p=(await receipt(u,s,stage).get()).data();if(p?.verified)return p;await new Promise(r=>setTimeout(r,150));}
 throw Error('FUNCTION_TRIGGER_RECEIPT_TIMEOUT');
};
const waitRevoked=async(u,s,stage,reason)=>{
 const deadline=Date.now()+30000;while(Date.now()<deadline){const p=(await receipt(u,s,stage).get()).data();if(p?.verified===false){assert.equal(p.invalidReason,reason);return p;}await new Promise(r=>setTimeout(r,150));}throw Error('REVOCATION_TIMEOUT');
};
async function client(user){
 const a=initializeApp({projectId:project,apiKey:'synthetic-api-key',storageBucket:BUCKET},user);clients.push(a);
 const au=getAuth(a);connectAuthEmulator(au,'http://127.0.0.1:9298',{disableWarnings:true});
 await signInWithEmailAndPassword(au,user+'@example.invalid','SYNTHETIC-LOCAL-ONLY-2026');
 const d=getFirestore(a);connectFirestoreEmulator(d,'127.0.0.1',8788);
 const st=getStorage(a);connectStorageEmulator(st,'127.0.0.1',9198);return {db:d,storage:st};
}
const paths=(u,s,stage)=>pathsFor({uid:u,sessionId:s,stage});
const upload=async(c,u,s,stage,keys=KEYS,bytes=jpeg)=>{for(const key of keys)await uploadBytes(ref(c.storage,paths(u,s,stage)[key]),bytes,{contentType:'image/jpeg'});};
const create=(c,u,s,d,p,start=100)=>{
 const b=writeBatch(c.db);
 b.set(doc(c.db,'vehicleSessions',s),{uid:u,driverId:d,plate:p,status:'active',startKm:start,endKm:null,inPhotos:paths(u,s,'in'),outPhotos:{},damageNote:'',cleanlinessNote:'',keyDropped:false,reviewChecks:{},startedAt:serverTimestamp(),endedAt:null,reviewedAt:null,reviewedBy:''});
 b.set(doc(c.db,'vehicleLocks',p),{plate:p,uid:u,driverId:d,sessionId:s,state:'active'});
 b.set(doc(c.db,'courierLocks',u),{plate:p,sessionId:s,state:'active'});
 b.set(doc(c.db,'driverLocks',d),{driverId:d,plate:p,uid:u,sessionId:s,state:'active'});
 return b.commit();
};
const checkout=(c,u,s,d,p,keyDropped=true,notes=true)=>{
 const b=writeBatch(c.db);b.update(doc(c.db,'vehicleSessions',s),{status:'awaiting_review',endKm:150,outPhotos:paths(u,s,'out'),damageNote:notes?'SYNTHETIC_DAMAGE':'',cleanlinessNote:notes?'SYNTHETIC_DIRT':'',keyDropped,endedAt:serverTimestamp()});
 for(const [col,id]of [['vehicleLocks',p],['courierLocks',u],['driverLocks',d]])b.update(doc(c.db,col,id),{state:'awaiting_review'});
 return b.commit();
};
async function review(c,u,s,d,p,checks={}){
 const fleet=doc(c.db,'fleetRecords','vehicle__'+p),old=(await getDoc(fleet)).data(),b=writeBatch(c.db);
 b.update(doc(c.db,'vehicleSessions',s),{status:'reviewed',reviewChecks:{carPresent:true,keyPresent:true,clean:true,damageReviewed:true,cleanlinessReviewed:true,...checks},reviewedAt:serverTimestamp(),reviewedBy:'synthetic_editor'});
 b.update(fleet,{'data.mileage':150,revision:old.revision+1,updatedAt:serverTimestamp(),updatedBy:'synthetic_editor'});
 for(const [col,id]of [['vehicleLocks',p],['courierLocks',u],['driverLocks',d]])b.delete(doc(c.db,col,id));
 return b.commit();
}
try{
 await env.clearFirestore();await env.clearStorage();
 for(const u of [uid,other,'synthetic_editor','synthetic_viewer']){
  try{await auth.deleteUser(u);}catch(e){if(e.code!=='auth/user-not-found')throw e;}
  await auth.createUser({uid:u,email:u+'@example.invalid',password:'SYNTHETIC-LOCAL-ONLY-2026'});
 }
 for(const [u,d]of [[uid,driver],[other,driver2]]){
  await db.doc('courierAccess/'+u).set({uid:u,driverId:d,active:true});
  await db.doc('drivers/'+d).set({daCode:d,name:'SYNTHETIC_TEST',vendor:'QA',capacity:50,active:true});
 }
 for(const role of ['editor','viewer'])await db.doc('users/synthetic_'+role).set({name:'SYNTHETIC_TEST',role,active:true});
 for(const p of [plate,plate2]){
  await db.doc('vehicles/'+p).set({plate:p,model:'SYNTHETIC_TEST',status:'Elérhető'});
  await db.doc('fleetRecords/vehicle__'+p).set({kind:'vehicle',data:initialVehicleDetails(p,100),revision:1,createdAt:new Date(),createdBy:'synthetic_editor',updatedAt:new Date(),updatedBy:'synthetic_editor'});
 }
 const c=await client(uid),o=await client(other),ed=await client('synthetic_editor'),viewer=await client('synthetic_viewer');
 await check('real Auth emulator courier login',async()=>assert.equal(getAuth(clients[0]).currentUser.uid,uid));
 await check('invented seven paths cannot issue car',()=>assertFails(create(c,uid,sid,driver,plate)));
 await check('other UID cannot upload own-prefix forged photo',()=>assertFails(uploadBytes(ref(o.storage,paths(uid,sid,'in').front),jpeg,{contentType:'image/jpeg'})));
 await check('anonymous Storage read denied',()=>assertFails(getBytes(ref(env.unauthenticatedContext().storage('gs://'+BUCKET),paths(uid,sid,'in').front))));
 await upload(c,uid,sid,'in',KEYS.slice(0,3));
 await check('partial upload/network interruption does not issue receipt',async()=>{assert.equal((await direct(uid,sid,'in')).status,'pending');assert.equal((await receipt(uid,sid,'in').get()).exists,false);});
 await upload(c,uid,sid,'in',KEYS.slice(3));
 let proof;await check('real Functions finalize trigger verifies seven originals',async()=>{proof=await waitProof(uid,sid,'in');assert.equal(Object.keys(proof.objects).length,7);assert.equal(proof.objects.front.width,64);});
 await check('duplicate event preserves original verifiedAt',async()=>{const before=proof.verifiedAt.toMillis();assert.equal((await direct(uid,sid,'in')).status,'already-verified');assert.equal((await receipt(uid,sid,'in').get()).data().verifiedAt.toMillis(),before);});
 await check('browser admin/editor cannot forge receipt',()=>assertFails(writeBatch(ed.db).set(doc(ed.db,receipt(uid,sid3,'in').path),{...proof,sessionId:sid3,verifiedAt:new Date()}).commit()));
 await check('another courier cannot read receipt',()=>assertFails(getDoc(doc(o.db,receipt(uid,sid,'in').path))));
 await check('original overwrite denied',()=>assertFails(uploadBytes(ref(c.storage,paths(uid,sid,'in').front),jpeg,{contentType:'image/jpeg'})));
 await check('original delete denied',()=>assertFails(deleteObject(ref(c.storage,paths(uid,sid,'in').front))));
 await check('verified photo enables atomic issue and three locks',async()=>{await create(c,uid,sid,driver,plate);assert.equal((await db.doc('vehicleLocks/'+plate).get()).data().sessionId,sid);});
 await upload(o,other,sid2,'in');await waitProof(other,sid2,'in');
 await check('same car cannot be issued to another courier',()=>assertFails(create(o,other,sid2,driver2,plate)));
 await check('out receipt cannot precede active session',async()=>assert.equal((await direct(other,sid2,'out')).code,'CHECKOUT_NOT_ACTIVE'));
 await check('same courier/DA cannot prepare a second active checkin',async()=>assert.equal((await direct(uid,sid3,'in')).code,'CHECKIN_ALREADY_ACTIVE'));
 await check('missing checkout photos cannot finish session',()=>assertFails(checkout(c,uid,sid,driver,plate)));
 await upload(c,uid,sid,'out');await waitProof(uid,sid,'out');
 await check('key drop false blocks checkout',()=>assertFails(checkout(c,uid,sid,driver,plate,false)));
 await check('verified seven return photos enable checkout',()=>checkout(c,uid,sid,driver,plate));
 await check('awaiting-review car remains locked',async()=>{assert.equal((await db.doc('vehicleLocks/'+plate).get()).data().state,'awaiting_review');await assertFails(create(o,other,sid2,driver2,plate));});
 await check('viewer cannot approve return',()=>assertFails(review(viewer,uid,sid,driver,plate)));
 await check('missing key keeps all locks',()=>assertFails(review(ed,uid,sid,driver,plate,{keyPresent:false})));
 await check('unchecked damage keeps all locks',()=>assertFails(review(ed,uid,sid,driver,plate,{damageReviewed:false})));
 await check('morning physical review frees car and updates canonical mileage',async()=>{await review(ed,uid,sid,driver,plate);assert.equal((await db.doc('vehicleLocks/'+plate).get()).exists,false);assert.equal((await db.doc('driverLocks/'+driver).get()).exists,false);assert.equal((await db.doc('fleetRecords/vehicle__'+plate).get()).data().data.mileage,150);});
 await check('daily report and free-car calculation consume new server data',async()=>{
  const sessions=(await db.collection('vehicleSessions').get()).docs.map(d=>({id:d.id,...d.data()}));
  const date=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Budapest'}).format(new Date());
  const report=attendanceDailyReport({date,sessions});assert.equal(report.ready,true);assert.equal(report.reviewedKm,50);
  assert.equal(fleetSummary({vehicles:[{plate,status:'Elérhető'}],locks:[]}).physicallyReady,1);
 });
 await check('original photo display verifies pinned manifest bytes',async()=>{
  const m=proof.objects.front;
  const blob=await readVerifiedPhoto({proof,expected:{uid,sessionId:sid,stage:'in',paths:paths(uid,sid,'in')},key:'front',metadata:async()=>({...m,fullPath:m.name}),download:async()=>new Blob([jpeg],{type:'image/jpeg'})});assert.equal(blob.size,jpeg.length);
 });
 await check('IAM-side replacement revokes proof via real finalize trigger',async()=>{
  await bucket.file(paths(uid,sid,'in').front).save(jpeg,{metadata:{contentType:'image/jpeg'}});
  await waitRevoked(uid,sid,'in','ORIGINAL_CHANGED');
 });
 await check('real metadata-update trigger revokes edited original',async()=>{await bucket.file(paths(uid,sid,'out').cargo).setMetadata({metadata:{syntheticAudit:'changed'}});await waitRevoked(uid,sid,'out','ORIGINAL_CHANGED');});
 await check('real delete trigger revokes missing original',async()=>{await bucket.file(paths(other,sid2,'in').front).delete();await waitRevoked(other,sid2,'in','OBJECT_MISSING');});
 await check('malformed JPEG never produces receipt despite allowed MIME',async()=>{await upload(c,uid,sid3,'in',KEYS,Buffer.from([255,216,255,217]));assert.equal((await direct(uid,sid3,'in')).code,'INVALID_JPEG');assert.equal((await receipt(uid,sid3,'in').get()).exists,false);});
 await check('inactive access cannot obtain proof',async()=>{await db.doc('courierAccess/'+uid).update({active:false});assert.equal((await direct(uid,sid3,'in')).code,'COURIER_DENIED');await db.doc('courierAccess/'+uid).update({active:true});});
 await check('invalid short DA code cannot mint a server receipt',async()=>{
  await db.doc('courierAccess/'+uid).update({driverId:'X'});
  assert.equal((await direct(uid,sid3,'in')).code,'COURIER_DENIED');
  assert.equal((await receipt(uid,sid3,'in').get()).exists,false);
  await db.doc('courierAccess/'+uid).update({driverId:driver});
 });
 await check('disabled real Auth account cannot obtain proof',async()=>{await auth.updateUser(uid,{disabled:true});assert.equal((await direct(uid,sid3,'in')).code,'ACCOUNT_DISABLED');await auth.updateUser(uid,{disabled:false});});
 const bulk=[{u:uid,d:driver,p:plate,s:'s_'+'d'.repeat(32),c},{u:other,d:driver2,p:plate2,s:'s_'+'e'.repeat(32),c:o}];
 await check('two distinct couriers can issue two free cars after reviewed return',async()=>{for(const x of bulk){await upload(x.c,x.u,x.s,'in');await waitProof(x.u,x.s,'in');await create(x.c,x.u,x.s,x.d,x.p,150);}});
 await check('two real seven-photo checkouts remain pending physical review',async()=>{for(const x of bulk){await upload(x.c,x.u,x.s,'out');await waitProof(x.u,x.s,'out');await checkout(x.c,x.u,x.s,x.d,x.p,true,false);}assert.equal((await db.collection('vehicleLocks').get()).size,2);});
 const sessions=(await db.collection('vehicleSessions').where('status','==','awaiting_review').get()).docs.map(d=>({id:d.id,...d.data()}));
 await check('bulk release requires explicit physical car and key confirmation',async()=>{assert.equal(bulkReviewEligible({sessions,physicallyChecked:true,keysChecked:false}).ok,false);assert.equal(bulkReviewEligible({sessions,physicallyChecked:true,keysChecked:true}).ok,true);});
 await check('one atomic bulk return frees both cars with all six ownership locks',async()=>{
  const b=writeBatch(ed.db);
  for(const x of bulk){const fleet=doc(ed.db,'fleetRecords','vehicle__'+x.p),old=(await getDoc(fleet)).data();
   b.update(doc(ed.db,'vehicleSessions',x.s),{status:'reviewed',reviewChecks:{carPresent:true,keyPresent:true,clean:true,damageReviewed:false,cleanlinessReviewed:false},reviewedAt:serverTimestamp(),reviewedBy:'synthetic_editor'});
   b.update(fleet,{'data.mileage':150,revision:old.revision+1,updatedAt:serverTimestamp(),updatedBy:'synthetic_editor'});
   for(const [col,id]of [['vehicleLocks',x.p],['courierLocks',x.u],['driverLocks',x.d]])b.delete(doc(ed.db,col,id));
  }
  await b.commit();for(const col of ['vehicleLocks','courierLocks','driverLocks'])assert.equal((await db.collection(col).get()).size,0);
 });
 console.log('PASS '+passed+' real-emulator backend/workflow scenarios; no cloud writes');
}finally{await Promise.all(clients.map(deleteApp));await env.cleanup();await app.delete();}
