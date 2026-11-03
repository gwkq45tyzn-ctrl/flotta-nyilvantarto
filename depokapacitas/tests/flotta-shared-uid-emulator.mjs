/**
 * Firestore emulator-only positive/negative shared-account tests.
 * The real UID placeholder is replaced IN MEMORY with a synthetic UID;
 * no production rules are modified, no real Firebase project is contacted.
 */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import {doc,getDoc,setDoc,updateDoc,deleteDoc} from 'firebase/firestore';

const uid='synthetic-imile-shared-uid-0001';
const otherUid='synthetic-other-admin-uid-0002';
const email='imilemanagement@imile-management-staging.firebaseapp.com';
const source=await readFile(new URL('../firestore.rules',import.meta.url),'utf8');
assert.ok(source.includes('REPLACE_WITH_REAL_SHARED_UID'));
const rules=source.replaceAll('REPLACE_WITH_REAL_SHARED_UID',uid);
const env=await initializeTestEnvironment({projectId:'demo-imile-fleet',
  firestore:{host:'127.0.0.1',port:8787,rules}});
let count=0;
async function check(label,allow,fn){
  try{
    await fn();
    if(!allow)throw Error(label+' unexpectedly allowed');
    console.log('PASS ALLOW '+label);count++;
  }catch(error){
    if(!allow&&error.code==='permission-denied'){
      console.log('PASS DENY '+label);count++;return;
    }
    throw Error('Authorization assertion failed for '+label+': '+error.message,{cause:error});
  }
}
try{
  await env.withSecurityRulesDisabled(async ctx=>{
    const db=ctx.firestore();
    await setDoc(doc(db,'users',uid),{name:'SYNTHETIC SHARED',active:true,role:'admin'});
    await setDoc(doc(db,'users',otherUid),{name:'SYNTHETIC OTHER',active:true,role:'admin'});
  });
  const shared=env.authenticatedContext(uid,{email}).firestore();
  const attacker=env.authenticatedContext(otherUid,{email}).firestore();
  const wrongEmail=env.authenticatedContext(uid,{email:'attacker@example.invalid'}).firestore();
  const anonymous=env.unauthenticatedContext().firestore();
  const record=(db)=>doc(db,'flottaSharedState','current');
  const initial={vehicles:[],drivers:[],fuelCards:[],contacts:[],revision:1};
  await check('anonymous read denied',false,()=>getDoc(record(anonymous)));
  await check('other active admin same email denied',false,()=>getDoc(record(attacker)));
  await check('same UID wrong email denied',false,()=>getDoc(record(wrongEmail)));
  await check('shared active admin can read',true,()=>getDoc(record(shared)));
  await check('other active admin cannot write',false,()=>setDoc(record(attacker),initial));
  await check('shared admin can initialize synthetic snapshot',true,()=>setDoc(record(shared),initial));
  await check('monotone revision rejects stale write',false,()=>updateDoc(record(shared),{revision:1}));
  await check('monotone revision rejects skipped revision',false,()=>updateDoc(record(shared),{revision:3}));
  await check('missing required data rejects update',false,()=>setDoc(record(shared),{
    vehicles:[],drivers:[],fuelCards:[],revision:2
  }));
  await check('authenticated shared cannot delete snapshot',false,()=>deleteDoc(record(shared)));
  await check('legitimate next revision allowed',true,()=>updateDoc(record(shared),{revision:2}));
  await env.withSecurityRulesDisabled(ctx=>setDoc(doc(ctx.firestore(),'users',uid),
    {name:'SYNTHETIC SHARED',active:false,role:'admin'}));
  await check('deactivated shared UID read denied',false,()=>getDoc(record(shared)));
  await check('deactivated shared UID write denied',false,()=>updateDoc(record(shared),{revision:3}));
  await env.withSecurityRulesDisabled(ctx=>setDoc(doc(ctx.firestore(),'users',uid),
    {name:'SYNTHETIC SHARED',active:true,role:'viewer'}));
  await check('shared viewer may read but not edit',true,()=>getDoc(record(shared)));
  await check('shared viewer cannot write',false,()=>updateDoc(record(shared),{revision:3}));
  console.log('PASS: '+count+' real Firestore emulator authorization cases, synthetic UID only');
}finally{
  await env.cleanup();
}
