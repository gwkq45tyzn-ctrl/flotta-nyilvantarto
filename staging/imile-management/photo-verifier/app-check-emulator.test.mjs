import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {initializeApp as initAdmin} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {getAuth as adminAuth} from 'firebase-admin/auth';
import {initializeApp,deleteApp} from 'firebase/app';
import {getAuth,connectAuthEmulator,signInWithEmailAndPassword} from 'firebase/auth';
import {getFirestore as clientDb,connectFirestoreEmulator,doc,setDoc,getDoc} from 'firebase/firestore';
import {getFunctions,connectFunctionsEmulator,httpsCallable} from 'firebase/functions';
import {attachQaAppCheck} from './app-check-client-qa.mjs';
import {counterKeys,dayKey,POLICY_EXAMPLE} from './quota-policy.mjs';
const project='demo-imile-quota';
assert.equal(process.env.FIRESTORE_EMULATOR_HOST,'127.0.0.1:8888');assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST,'127.0.0.1:9398');
const app=initAdmin({projectId:project}),db=getFirestore(app),auth=adminAuth(app);
const uid='qa_appcheck',other='qa_appcheck_duplicate',da='SYNAPP01',apps=[],id=()=>randomBytes(16).toString('hex');
let passed=0,revision=100;
const check=async(name,fn)=>{await fn();passed++;console.log('PASS '+name);};
const endpoint='http://127.0.0.1:5108/'+project+'/europe-west3/attendancePhotoPermit';
async function proof(variant=''){return (await (await fetch('http://127.0.0.1:8181/token?variant='+variant)).json()).token;}
async function client(u){
 const a=initializeApp({projectId:project,apiKey:'synthetic-api-key'},u);apps.push(a);attachQaAppCheck(a);
 const au=getAuth(a);connectAuthEmulator(au,'http://127.0.0.1:9398',{disableWarnings:true});
 await signInWithEmailAndPassword(au,u+'@example.invalid','SYNTHETIC-QUOTA-LOCAL-2026');
 const d=clientDb(a);connectFirestoreEmulator(d,'127.0.0.1',8888);
 const f=getFunctions(a,'europe-west3');connectFunctionsEmulator(f,'127.0.0.1',5108);
 return {auth:au,db:d,call:async data=>(await httpsCallable(f,'attendancePhotoPermit')(data)).data};
}
async function raw(c,appToken,data={action:'begin',requestId:id()},authToken){
 const headers={'Content-Type':'application/json'};
 if(c)headers.Authorization='Bearer '+(authToken||await c.auth.currentUser.getIdToken());
 if(appToken)headers['X-Firebase-AppCheck']=appToken;
 const res=await fetch(endpoint,{method:'POST',headers,body:JSON.stringify({data})});return {status:res.status,body:await res.json()};
}
const policy=async patch=>db.doc('photoPermitSecurityPolicy/current').set({revision:++revision,uidPerMinute:10000,uidBurst:10000,daPerMinute:10000,daBurst:10000,...patch});
const quota=async()=>(await db.doc('photoUploadQuotas/'+counterKeys(dayKey(Date.now()),uid,da)[0]).get()).data()?.used||0;
try{
 for(const u of [uid,other]){
  try{await auth.getUser(u);throw Error('FRESH_SYNTHETIC_FIXTURE_REQUIRED');}catch(e){if(e.code!=='auth/user-not-found')throw e;}
  await auth.createUser({uid:u,email:u+'@example.invalid',password:'SYNTHETIC-QUOTA-LOCAL-2026'});
  await db.doc('courierAccess/'+u).set({uid:u,driverId:da,active:true});
 }
 await db.doc('drivers/'+da).set({daCode:da,name:'SYNTHETIC_TEST',active:true,vendor:'QA',capacity:50});
 await db.doc('photoUploadPolicy/current').set({...POLICY_EXAMPLE,enabled:true,uidDailyLimit:1,driverDailyLimit:1});
 await policy({});
 const c=await client(uid),o=await client(other);
 await check('missing App Check rejected before quota allocation',async()=>{assert.equal((await raw(c,null)).status,401);assert.equal(await quota(),0);});
 for(const variant of ['bad-signature','wrong-app','wrong-project','expired','future'])
  await check(variant+' App Check rejected with no quota allocation',async()=>{assert.equal((await raw(c,await proof(variant))).status,401);assert.equal(await quota(),0);});
 await check('malformed App Check rejected',async()=>assert.equal((await raw(c,'malformed')).status,401));
 await check('App Check alone cannot replace Firebase Auth',async()=>assert.equal((await raw(null,await proof())).status,401));
 let grant;
 const request=id();
 await check('actual Web SDK attaches signed synthetic App Check',async()=>{grant=await c.call({action:'begin',requestId:request});assert.match(grant.sessionId,/^s_[a-f0-9]{32}$/);assert.equal(await quota(),1);});
 await check('retry preserves original permit and quota',async()=>{assert.equal((await c.call({action:'begin',requestId:request})).sessionId,grant.sessionId);assert.equal(await quota(),1);});
 await check('unknown security policy fails closed',async()=>{await db.doc('photoPermitSecurityPolicy/current').delete();assert.match(JSON.stringify((await raw(c,await proof())).body),/CALL_POLICY_NOT_CONFIGURED/);await policy({});});
 await check('atomic concurrent calls obey UID burst',async()=>{
  await policy({uidBurst:2,uidPerMinute:1});const token=await proof();
  const responses=await Promise.all(Array.from({length:6},()=>raw(c,token,{action:'begin',requestId:request})));
  assert.equal(responses.filter(r=>r.status===200).length,2);assert.equal(responses.filter(r=>JSON.stringify(r.body).includes('CALL_RATE_LIMITED')).length,4);assert.equal(await quota(),1);
 });
 await check('DA limit shared across separate authenticated accounts',async()=>{
  await policy({daBurst:1,daPerMinute:1});const t=await proof();assert.equal((await raw(c,t,{action:'begin',requestId:request})).status,200);
  assert.match(JSON.stringify((await raw(o,t)).body),/CALL_RATE_LIMITED/);assert.equal(await quota(),1);
 });
 await check('rate rejection cannot be avoided with new request IDs',async()=>assert.match(JSON.stringify((await raw(c,await proof())).body),/CALL_RATE_LIMITED/));
 await policy({});
 await check('live access revocation rejects previously authenticated client',async()=>{
  await db.doc('courierAccess/'+uid).update({active:false});
  assert.match(JSON.stringify((await raw(c,await proof())).body),/COURIER_DENIED/);
  await db.doc('courierAccess/'+uid).update({active:true});
 });
 await check('disabled canonical driver rejected',async()=>{
  await db.doc('drivers/'+da).update({active:false});assert.match(JSON.stringify((await raw(c,await proof())).body),/DRIVER_INACTIVE/);
  await db.doc('drivers/'+da).update({active:true});
 });
 await check('disabled Auth rejects valid App Check and cached token',async()=>{
  const token=await c.auth.currentUser.getIdToken();await auth.updateUser(uid,{disabled:true});
  assert.equal((await raw(c,await proof(),undefined,token)).status,401);await auth.updateUser(uid,{disabled:false});
 });
 await check('revoked Auth refresh tokens rejected',async()=>{
  const token=await c.auth.currentUser.getIdToken();await new Promise(r=>setTimeout(r,1100));await auth.revokeRefreshTokens(uid);
  assert.equal((await raw(c,await proof(),undefined,token)).status,401);
 });
 await check('courier cannot write rate configuration or counters',async()=>{
  for(const col of ['photoPermitSecurityPolicy','photoPermitCallLimits'])await assert.rejects(()=>setDoc(doc(o.db,col,'SYNTHETIC_FORGED'),{uid:other}),e=>e.code==='permission-denied');
 });
 await check('courier cannot read rate counters',async()=>assert.rejects(()=>getDoc(doc(o.db,'photoPermitCallLimits','SYNTHETIC_FORGED')),e=>e.code==='permission-denied'));
 console.log('APP_CHECK_EMULATOR_RESULT '+JSON.stringify({passed,failed:0,synthetic:true}));
}finally{await Promise.all(apps.map(deleteApp));await db.terminate();}
