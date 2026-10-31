// Isolated emulator-only OFD report permissions. No cloud project data accessed.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import {doc,setDoc,getDoc,deleteDoc,writeBatch,updateDoc,serverTimestamp} from 'firebase/firestore';
const rules=await readFile(new URL('../../../depokapacitas/firestore.rules',import.meta.url),'utf8');
const env=await initializeTestEnvironment({projectId:'demo-imile-fleet',
 firestore:{host:'127.0.0.1',port:8787,rules}});
const db=Object.fromEntries(['admin','editor','viewer','inactive','anonymous'].map(role=>
 [role,role==='anonymous'?env.unauthenticatedContext().firestore():env.authenticatedContext(role).firestore()]));
let passed=0;const expect=async(name,allowed,fn)=>{
 try{await fn();if(!allowed)throw Error('unexpected-allow');passed++;console.log('PASS '+name);}
 catch(error){if(!allowed&&error.code==='permission-denied'){passed++;console.log('PASS '+name+' denied');return;}
  throw Error(name+': '+error.message,{cause:error});}
};
try{
 await env.withSecurityRulesDisabled(async context=>{
  const sys=context.firestore();
  for(const role of ['admin','editor','viewer','inactive'])
   await setDoc(doc(sys,'users',role),{name:'SYNTHETIC QA',role:role==='inactive'?'viewer':role,active:role!=='inactive'});
 });
 const key='2099-02-01__DS(AKE)',a1='A'.repeat(20),a2='B'.repeat(20),a3='C'.repeat(20);
 const record=(actor,id,status='provisional',version=1,contentHash='a'.repeat(64),old=null)=>({
  key,date:'2099-02-01',station:'DS(AKE)',status,
  rows:[{daCode:'D1',daName:'SYNTHETIC',vendor:'QA',ofd:10,delivered:8}],
  totalOFD:10,totalDelivered:8,courierCount:1,contentHash,
  sourceName:'SYNTHETIC_QA.xlsx',version,lastAuditId:id,
  createdAt:old?old.createdAt:serverTimestamp(),createdBy:old?old.createdBy:actor,
  updatedAt:serverTimestamp(),updatedBy:actor
 });
 const audit=(actor,id,version,status,hash,prior='')=>({
  reportKey:key,version,contentHash:hash,priorHash:prior,
  action:prior?'replace':'create',status,actor,at:serverTimestamp(),sourceName:'SYNTHETIC_QA.xlsx'
 });
 const push=(role,id,r,a)=>{
  const b=writeBatch(db[role]);b.set(doc(db[role],'performanceDays',key),r);
  if(a)b.set(doc(db[role],'performanceAudits',id),a);
  return b.commit();
 };
 await expect('anonymous cannot read',false,()=>getDoc(doc(db.anonymous,'performanceDays',key)));
 await expect('viewer cannot read absent? member read allowed',true,()=>getDoc(doc(db.viewer,'performanceDays',key)));
 await expect('viewer cannot write paired report',false,()=>push('viewer',a1,record('viewer',a1),audit('viewer',a1,1,'provisional','a'.repeat(64))));
 await expect('inactive cannot write',false,()=>push('inactive',a1,record('inactive',a1),audit('inactive',a1,1,'provisional','a'.repeat(64))));
 await expect('editor without audit denied',false,()=>push('editor',a1,record('editor',a1),null));
 await expect('editor paired creation works',true,()=>push('editor',a1,record('editor',a1),audit('editor',a1,1,'provisional','a'.repeat(64))));
 const saved=(await getDoc(doc(db.editor,'performanceDays',key))).data();
 assert.equal(saved.version,1);
 await expect('anonymous cannot read stored',false,()=>getDoc(doc(db.anonymous,'performanceDays',key)));
 await expect('viewer can read stored',true,()=>getDoc(doc(db.viewer,'performanceDays',key)));
 await expect('viewer cannot replace',false,()=>push('viewer',a2,record('viewer',a2,'provisional',2,'b'.repeat(64),saved),audit('viewer',a2,2,'provisional','b'.repeat(64),'a'.repeat(64))));
 await expect('editor cannot update without audit',false,()=>updateDoc(doc(db.editor,'performanceDays',key),{version:2,lastAuditId:a2,updatedAt:serverTimestamp(),updatedBy:'editor'}));
 await expect('editor audited revision succeeds',true,()=>push('editor',a2,record('editor',a2,'final',2,'b'.repeat(64),saved),audit('editor',a2,2,'final','b'.repeat(64),'a'.repeat(64))));
 const final=(await getDoc(doc(db.editor,'performanceDays',key))).data();
 await expect('final cannot downgrade to provisional',false,()=>push('editor',a3,record('editor',a3,'provisional',3,'c'.repeat(64),final),audit('editor',a3,3,'provisional','c'.repeat(64),'b'.repeat(64))));
 await expect('stale revision update denied',false,()=>push('editor',a3,record('editor',a3,'final',2,'c'.repeat(64),final),audit('editor',a3,2,'final','c'.repeat(64),'b'.repeat(64))));
 await expect('wrong previous hash denied',false,()=>push('editor',a3,record('editor',a3,'final',3,'c'.repeat(64),final),audit('editor',a3,3,'final','c'.repeat(64),'f'.repeat(64))));
 await expect('audit mutation forbidden',false,()=>updateDoc(doc(db.admin,'performanceAudits',a1),{action:'replace'}));
 await expect('report deletion forbidden',false,()=>deleteDoc(doc(db.admin,'performanceDays',key)));
 await expect('audit deletion forbidden',false,()=>deleteDoc(doc(db.admin,'performanceAudits',a1)));
 console.log('PASS: '+passed+' synthetic authenticated Firestore report/audit rules cases');
}finally{await env.cleanup();}
