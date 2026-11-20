// Local Firestore emulator only. Browser writes are denied for all report data.
// Trusted server Admin SDK bypasses Rules after its own validation + Auth.
import {readFile} from 'node:fs/promises';
import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import {doc,setDoc,getDoc,updateDoc,deleteDoc} from 'firebase/firestore';
const rules=await readFile(new URL('../../../depokapacitas/firestore.rules',import.meta.url),'utf8');
const env=await initializeTestEnvironment({projectId:'demo-imile-fleet',
 firestore:{host:'127.0.0.1',port:8787,rules}});
const roles=['admin','editor','viewer','inactive','anonymous'];
const db=Object.fromEntries(roles.map(role=>[role,
 role==='anonymous'?env.unauthenticatedContext().firestore():env.authenticatedContext(role).firestore()]));
const collections=['performanceDays','performanceAudits','performanceVersions',
 'inventoryDays','inventoryAudits','inventoryVersions'];
let passed=0;
async function test(name,allowed,fn){
 try{await fn();if(!allowed)throw Error('unexpected browser access');passed++;}
 catch(error){
  if(!allowed&&error.code==='permission-denied'){passed++;return;}
  throw Error(name+': '+error.message,{cause:error});
 }
}
try{
 await env.withSecurityRulesDisabled(async context=>{
  const seeded=context.firestore();
  for(const role of roles.filter(x=>x!=='anonymous'))
   await setDoc(doc(seeded,'users',role),{
    name:'SYNTHETIC',role:role==='inactive'?'viewer':role,active:role!=='inactive'});
  for(const collection of collections)
   await setDoc(doc(seeded,collection,'SYNTHETIC_QA'),{synthetic:true,
    key:'2099-02-01__DS(AKE)',version:1});
 });
 for(const collection of collections){
  for(const role of roles){
   const permitted=['admin','editor','viewer'].includes(role);
   await test(role+': '+collection+' read',permitted,
    ()=>getDoc(doc(db[role],collection,'SYNTHETIC_QA')));
   await test(role+': '+collection+' create DENY',false,
    ()=>setDoc(doc(db[role],collection,'SYNTHETIC_NEW'),{synthetic:true}));
   await test(role+': '+collection+' update DENY',false,
    ()=>updateDoc(doc(db[role],collection,'SYNTHETIC_QA'),{synthetic:false}));
   await test(role+': '+collection+' delete DENY',false,
    ()=>deleteDoc(doc(db[role],collection,'SYNTHETIC_QA')));
  }
 }
 console.log('PASS: '+passed+' Firestore synthetic role/read and deny-direct-write checks');
}finally{await env.cleanup();}
