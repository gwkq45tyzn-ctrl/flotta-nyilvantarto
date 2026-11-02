// Destructive ONLY to this disposable demo emulator's synthetic QA dataset.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import sharp from 'sharp';
import {initializeApp as initAdmin} from 'firebase-admin/app';
import {getFirestore as adminDb} from 'firebase-admin/firestore';
import {getAuth as adminAuth} from 'firebase-admin/auth';
import {getStorage as adminStorage} from 'firebase-admin/storage';
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing';
import {initializeApp,deleteApp} from 'firebase/app';
import {getAuth,connectAuthEmulator,signInWithEmailAndPassword} from 'firebase/auth';
import {getFirestore,connectFirestoreEmulator,doc,getDoc,updateDoc,writeBatch,serverTimestamp} from 'firebase/firestore';
import {getStorage,connectStorageEmulator,ref,uploadBytes,getMetadata} from 'firebase/storage';
import {getFunctions,connectFunctionsEmulator,httpsCallable} from 'firebase/functions';
import {attachQaAppCheck} from './app-check-client-qa.mjs';
import {BUCKET,KEYS,pathsFor,verifyEvent} from './verifier.mjs';
import {serverAdapters} from './adapters.mjs';
import {counterKeys,dayKey,POLICY_EXAMPLE} from './quota-policy.mjs';
import {initialVehicleDetails} from '../fleet/operations-data.mjs';
for(const [k,v]of Object.entries({FIRESTORE_EMULATOR_HOST:'127.0.0.1:8888',FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9398'}))assert.equal(process.env[k],v,'LOOPBACK_ONLY');
assert.match(process.env.STORAGE_EMULATOR_HOST||'',/^(http:\/\/)?127\.0\.0\.1:9297$/);
const project='demo-imile-quota',app=initAdmin({projectId:project,storageBucket:BUCKET}),db=adminDb(app),auth=adminAuth(app),bucket=adminStorage(app).bucket();
const env=await initializeTestEnvironment({projectId:project,firestore:{host:'127.0.0.1',port:8888,rules:await fs.readFile(new URL('../../../depokapacitas/firestore.rules',import.meta.url),'utf8')},storage:{host:'127.0.0.1',port:9297,rules:await fs.readFile(new URL('../attendance/storage.rules',import.meta.url),'utf8')}});
const pending='qa_stop_pending',active='qa_stop_active',fresh='qa_stop_new',admin='qa_stop_admin',viewer='qa_stop_viewer',plate='SYNSTOP1',apps=[];
const da=u=>({[pending]:'SYNSTOP01',[active]:'SYNSTOP02',[fresh]:'SYNSTOP03'})[u],id=()=>randomBytes(16).toString('hex'),reason='SYNTHETIC_TEST emergency stop and lossless recovery';
const jpeg=await sharp({create:{width:48,height:32,channels:3,background:'#227755'}}).jpeg().toBuffer();
let passed=0;const check=async(n,fn)=>{await fn();passed++;console.log('PASS '+n);};
const err=(fn,code)=>assert.rejects(fn,e=>e.message?.includes(code),'expected '+code);
async function client(uid){
 const a=initializeApp({projectId:project,apiKey:'synthetic-api-key',storageBucket:BUCKET},uid);apps.push(a);attachQaAppCheck(a);
 const au=getAuth(a);connectAuthEmulator(au,'http://127.0.0.1:9398',{disableWarnings:true});await signInWithEmailAndPassword(au,uid+'@example.invalid','SYNTHETIC-STOP-LOCAL-2026');
 const d=getFirestore(a);connectFirestoreEmulator(d,'127.0.0.1',8888);const st=getStorage(a);connectStorageEmulator(st,'127.0.0.1',9297);
 const f=getFunctions(a,'europe-west3');connectFunctionsEmulator(f,'127.0.0.1',5108);
 return {db:d,storage:st,call:async p=>(await httpsCallable(f,'attendancePhotoPermit')(p)).data};
}
const paths=(u,s,stage)=>pathsFor({uid:u,sessionId:s,stage});
const photo=(c,u,s,stage,k)=>uploadBytes(ref(c.storage,paths(u,s,stage)[k]),jpeg,{contentType:'image/jpeg'});
const proof=(u,s,stage)=>db.doc('photoReceipts/'+u+'/sessions/'+s+'/stages/'+stage);
async function waitProof(u,s,stage){const until=Date.now()+45000;while(Date.now()<until){const p=(await proof(u,s,stage).get()).data();if(p?.verified)return p;await new Promise(r=>setTimeout(r,150));}throw Error('RECEIPT_TIMEOUT');}
const adapters=serverAdapters(app);
const inspect=(u,s,stage)=>verifyEvent({data:{bucket:BUCKET,name:paths(u,s,stage).front}},adapters);
const count=async u=>Promise.all(counterKeys(dayKey(Date.now()),u,da(u)).map(async k=>(await db.doc('photoUploadQuotas/'+k).get()).data()?.used||0));
const locks=()=>Promise.all(['vehicleLocks/'+plate,'courierLocks/'+active,'driverLocks/'+da(active)].map(async p=>(await db.doc(p).get()).data()));
const record=async()=>(await db.doc('vehicleSessions/'+live.sessionId).get()).data();
const canonical=v=>JSON.stringify(v);
const policy={...POLICY_EXAMPLE,uidDailyLimit:3,driverDailyLimit:3,resumeHours:24,maxAdminExtraPerDay:0,maxRequestAliases:4};
let p,a,ad,v,grant,live,originalLocks,originalSession;
async function setPolicy(revision,enabled){return ad.call({action:'adminPolicy',operationId:id(),expectedRevision:revision-1,policy:{...policy,revision,enabled},reason});}
try{
 await env.clearFirestore();await env.clearStorage();
 for(const uid of [pending,active,fresh,admin,viewer]){
  try{const old=await auth.getUser(uid);assert.equal(old.email,uid+'@example.invalid');await auth.deleteUser(uid);}catch(e){if(e.code!=='auth/user-not-found')throw e;}
  await auth.createUser({uid,email:uid+'@example.invalid',password:'SYNTHETIC-STOP-LOCAL-2026'});
 }
 for(const uid of [pending,active,fresh]){await db.doc('courierAccess/'+uid).set({uid,driverId:da(uid),active:true});await db.doc('drivers/'+da(uid)).set({daCode:da(uid),name:'SYNTHETIC_TEST_STOP',vendor:'QA',active:true,capacity:50});}
 await db.doc('users/'+admin).set({name:'SYNTHETIC_TEST_STOP',role:'admin',active:true});await db.doc('users/'+viewer).set({name:'SYNTHETIC_TEST_STOP',role:'viewer',active:true});
 await db.doc('vehicles/'+plate).set({plate,model:'SYNTHETIC_TEST_STOP',status:'Elérhető'});
 await db.doc('fleetRecords/vehicle__'+plate).set({kind:'vehicle',data:initialVehicleDetails(plate,100),revision:1,createdAt:new Date(),createdBy:admin,updatedAt:new Date(),updatedBy:admin});
 await db.doc('photoPermitSecurityPolicy/current').set({revision:1,uidPerMinute:10000,uidBurst:10000,daPerMinute:10000,daBurst:10000});
 p=await client(pending);a=await client(active);ad=await client(admin);v=await client(viewer);const n=await client(fresh);
 await check('closed bootstrap is revision1 enabled:false',async()=>{await setPolicy(1,false);assert.equal((await db.doc('photoUploadPolicy/current').get()).data().enabled,false);});
 await check('closed pilot issues no new session or quota',async()=>{await err(()=>p.call({action:'begin',requestId:id()}),'UPLOADS_DISABLED');assert.deepEqual(await count(pending),[0,0]);});
 await check('only explicit next revision2 activates',async()=>{await err(()=>setPolicy(1,true),'POLICY_REVISION_CONFLICT');await setPolicy(2,true);});
 grant=await p.call({action:'begin',requestId:id()});live=await a.call({action:'begin',requestId:id()});
 await check('partial three-photo stage has no false receipt',async()=>{for(const k of KEYS.slice(0,3))await photo(p,pending,grant.sessionId,'in',k);assert.equal((await proof(pending,grant.sessionId,'in').get()).exists,false);});
 const originals=await Promise.all(KEYS.slice(0,3).map(k=>getMetadata(ref(p.storage,paths(pending,grant.sessionId,'in')[k]))));
 for(const k of KEYS)await photo(a,active,live.sessionId,'in',k);await waitProof(active,live.sessionId,'in');
 await check('active usage is backed by seven verified originals and three locks',async()=>{
  const b=writeBatch(a.db);b.set(doc(a.db,'vehicleSessions',live.sessionId),{uid:active,driverId:da(active),plate,status:'active',startKm:100,endKm:null,inPhotos:paths(active,live.sessionId,'in'),outPhotos:{},damageNote:'',cleanlinessNote:'',keyDropped:false,reviewChecks:{},startedAt:serverTimestamp(),endedAt:null,reviewedAt:null,reviewedBy:''});
  b.set(doc(a.db,'vehicleLocks',plate),{plate,uid:active,driverId:da(active),sessionId:live.sessionId,state:'active'});b.set(doc(a.db,'courierLocks',active),{plate,sessionId:live.sessionId,state:'active'});b.set(doc(a.db,'driverLocks',da(active)),{driverId:da(active),plate,uid:active,sessionId:live.sessionId,state:'active'});await b.commit();
  await a.call({action:'checkout',sessionId:live.sessionId});for(const k of KEYS.slice(0,3))await photo(a,active,live.sessionId,'out',k);
  originalLocks=canonical(await locks());originalSession=canonical(await record());assert.equal((await locks()).length,3);
 });
 await check('STOP revision3 disables new grants and renewal',async()=>{await setPolicy(3,false);for(const [c,data]of [[n,{action:'begin',requestId:id()}],[p,{action:'begin',requestId:grant.requestId}],[a,{action:'checkout',sessionId:live.sessionId}]])await err(()=>c.call(data),'UPLOADS_DISABLED');});
 await check('disabled policy does not pretend to revoke existing Storage capability',async()=>{await photo(p,pending,grant.sessionId,'in',KEYS[3]);assert.equal((await proof(pending,grant.sessionId,'in').get()).exists,false);});
 const revoke=id();
 await check('admin can revoke pending capability AFTER STOP',async()=>{const result=await ad.call({action:'adminRevoke',operationId:revoke,targetUid:pending,sessionId:grant.sessionId,reason});assert.equal(result.status,'revoked');});
 await check('revocation is audited, replay-safe and consumes no new quota',async()=>{assert.equal((await ad.call({action:'adminRevoke',operationId:revoke,targetUid:pending,sessionId:grant.sessionId,reason})).replayed,true);assert.equal((await db.doc('photoUploadAdminOps/'+revoke).get()).data().actorUid,admin);assert.deepEqual(await count(pending),[1,1]);});
 await check('revoked permit cannot upload remaining originals or create receipt',async()=>{await assertFails(photo(p,pending,grant.sessionId,'in',KEYS[4]));assert.equal((await inspect(pending,grant.sessionId,'in')).code,'PERMIT_MISSING_OR_EXPIRED');assert.equal((await proof(pending,grant.sessionId,'in').get()).exists,false);});
 await check('grant and resume remain forbidden while disabled',async()=>{for(const data of [{action:'adminGrant',amount:1},{action:'adminResume',sessionId:grant.sessionId}])await err(()=>ad.call({...data,operationId:id(),targetUid:pending,reason}),'UPLOADS_DISABLED');});
 await check('viewer cannot revoke or enable during STOP',async()=>{await err(()=>v.call({action:'adminRevoke',operationId:id(),targetUid:pending,sessionId:grant.sessionId,reason}),'ADMIN_REQUIRED');await err(()=>v.call({action:'adminPolicy',operationId:id(),expectedRevision:3,policy:{...policy,revision:4,enabled:true},reason}),'ADMIN_REQUIRED');assert.equal((await db.doc('photoUploadPolicy/current').get()).data().enabled,false);});
 await check('revoking ACTIVE session is rejected without deleting locks or history',async()=>{await err(()=>ad.call({action:'adminRevoke',operationId:id(),targetUid:active,sessionId:live.sessionId,reason}),'SESSION_ALREADY_CREATED');assert.equal(canonical(await locks()),originalLocks);assert.equal(canonical(await record()),originalSession);});
 await check('disabling courierAccess immediately denies current token Storage and Firestore writes',async()=>{
  await updateDoc(doc(ad.db,'courierAccess',active),{active:false});await assertFails(photo(a,active,live.sessionId,'out',KEYS[3]));await assertFails(updateDoc(doc(a.db,'vehicleSessions',live.sessionId),{endKm:110}));
  assert.equal(canonical(await locks()),originalLocks);assert.equal(canonical(await record()),originalSession);
 });
 await check('disabled courier cannot read its private photo or session',async()=>{await assertFails(getDoc(doc(a.db,'vehicleSessions',live.sessionId)));await assertFails(getMetadata(ref(a.storage,paths(active,live.sessionId,'in').front)));});
 await check('late in-flight originals while stopped produce no false receipt',async()=>{
  // Trusted fixture simulates accepted bytes whose finalize event arrives late.
  for(const k of KEYS.slice(3))await bucket.file(paths(active,live.sessionId,'out')[k]).save(jpeg,{resumable:false,metadata:{contentType:'image/jpeg'}});
  assert.equal((await inspect(active,live.sessionId,'out')).code,'COURIER_DENIED');assert.equal((await proof(active,live.sessionId,'out').get()).exists,false);
 });
 await check('rollback cannot lower policy revision or restore old enabled snapshot',async()=>{await err(()=>setPolicy(2,true),'POLICY_REVISION_CONFLICT');await setPolicy(4,false);assert.equal((await db.doc('photoUploadPolicy/current').get()).data().enabled,false);});
 await check('no data loss throughout STOP and closed restore',async()=>{assert.equal(canonical(await locks()),originalLocks);assert.equal(canonical(await record()),originalSession);for(let i=0;i<3;i++){const m=(await bucket.file(originals[i].fullPath).getMetadata())[0];assert.equal(String(m.generation),originals[i].generation);}assert.deepEqual(await count(active),[1,1]);});
 await check('approved synthetic recovery requires explicit revision5 and re-enabled access',async()=>{await setPolicy(5,true);await updateDoc(doc(ad.db,'courierAccess',active),{active:true});});
 await check('pending revoked session resumes SAME ID, original generations and quota',async()=>{await ad.call({action:'adminResume',operationId:id(),targetUid:pending,sessionId:grant.sessionId,reason});assert.equal((await p.call({action:'begin',requestId:grant.requestId})).sessionId,grant.sessionId);for(const k of KEYS.slice(4))await photo(p,pending,grant.sessionId,'in',k);await waitProof(pending,grant.sessionId,'in');assert.deepEqual(await count(pending),[1,1]);for(let i=0;i<3;i++)assert.equal((await getMetadata(ref(p.storage,originals[i].fullPath))).generation,originals[i].generation);});
 await check('active checkout renewal preserves session and all locks',async()=>{assert.equal((await a.call({action:'checkout',sessionId:live.sessionId})).sessionId,live.sessionId);assert.equal(canonical(await locks()),originalLocks);});
 await check('trusted existing storage-event verifier replay recovers late receipt',async()=>{
  const metadata=(await bucket.file(paths(active,live.sessionId,'out').front).getMetadata())[0];
  // Same native Storage→Functions protocol used by firebase-tools 15.34.2.
  // This loopback maintenance replay is not a public callable or cloud IAM proof.
  const response=await fetch('http://127.0.0.1:5108/functions/projects/'+project+'/trigger_multicast',{method:'POST',headers:{'Content-Type':'application/cloudevents+json; charset=UTF-8'},body:JSON.stringify({id:'synthetic-recovery-'+id(),source:'//storage.googleapis.com/projects/_/buckets/'+BUCKET+'/objects/'+metadata.name,specversion:'1.0',type:'google.cloud.storage.object.v1.finalized',time:new Date().toISOString(),data:{bucket:BUCKET,name:metadata.name,generation:String(metadata.generation)}})});assert.equal(response.status,200);
  const receipt=await waitProof(active,live.sessionId,'out');assert.equal(Object.keys(receipt.objects).length,7);
 });
 await check('recovery finishes normal 7+7 checkout without unlocking unreviewed car',async()=>{
  const b=writeBatch(a.db);b.update(doc(a.db,'vehicleSessions',live.sessionId),{status:'awaiting_review',endKm:125,outPhotos:paths(active,live.sessionId,'out'),damageNote:'',cleanlinessNote:'',keyDropped:true,endedAt:serverTimestamp()});for(const [col,key]of [['vehicleLocks',plate],['courierLocks',active],['driverLocks',da(active)]])b.update(doc(a.db,col,key),{state:'awaiting_review'});await b.commit();assert.equal((await record()).status,'awaiting_review');assert.ok((await locks()).every(l=>l.state==='awaiting_review'));
 });
 await check('physical return updates Fleet and releases all three locks atomically',async()=>{
  const b=writeBatch(ad.db);b.update(doc(ad.db,'vehicleSessions',live.sessionId),{status:'reviewed',reviewChecks:{carPresent:true,keyPresent:true,clean:true,damageReviewed:false,cleanlinessReviewed:false},reviewedAt:serverTimestamp(),reviewedBy:admin});b.update(doc(ad.db,'fleetRecords','vehicle__'+plate),{'data.mileage':125,revision:2,updatedAt:serverTimestamp(),updatedBy:admin});for(const [col,key]of [['vehicleLocks',plate],['courierLocks',active],['driverLocks',da(active)]])b.delete(doc(ad.db,col,key));await b.commit();assert.equal((await record()).status,'reviewed');assert.ok((await locks()).every(l=>!l));assert.deepEqual(await count(active),[1,1]);
 });
 await check('all fourteen active-stage originals survive STOP and recovery',async()=>{for(const stage of ['in','out']){const receipt=(await proof(active,live.sessionId,stage).get()).data();assert.equal(receipt.verified,true);assert.equal(Object.keys(receipt.objects).length,7);for(const object of Object.values(receipt.objects))assert.equal(String((await bucket.file(object.name).getMetadata())[0].generation),object.generation);}});
 console.log('RELEASE_STOP_RESULT '+JSON.stringify({passed,failed:0,synthetic:true,cloudWrites:false}));
}finally{await Promise.all(apps.map(deleteApp));await env.cleanup();await db.terminate();}
