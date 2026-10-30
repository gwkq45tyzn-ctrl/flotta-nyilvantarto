// Requires a LOCAL Firestore emulator at 127.0.0.1:8787. Never contacts staging.
import fs from 'node:fs/promises';
import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import {doc,collection,getDoc,getDocs,setDoc,updateDoc,deleteDoc,writeBatch,serverTimestamp} from 'firebase/firestore';
import {schemas,normalizeFleetRecord} from './operations-data.mjs';
const env=await initializeTestEnvironment({projectId:'demo-imile-fleet',firestore:{host:'127.0.0.1',port:8787,rules:await fs.readFile(new URL('../../../depokapacitas/firestore.rules',import.meta.url),'utf8')}});
await env.clearFirestore();console.log('SEED START');
const roles=['admin','editor','viewer','inactive','unknown','unlisted','anonymous'];
const db=Object.fromEntries(roles.map(role=>[role,role==='anonymous'?env.unauthenticatedContext().firestore():env.authenticatedContext(role).firestore()]));
const report={compiler:'PASS',project:'demo-imile-fleet',tests:[]};
async function test(name,allowed,fn){console.log('RUN: '+name);try{await fn();report.tests.push({name,expected:allowed?'ALLOW':'DENY',actual:'ALLOW',pass:allowed});}catch(error){const denied=error.code==='permission-denied';report.tests.push({name,expected:allowed?'ALLOW':'DENY',actual:denied?'DENY':error.message,pass:!allowed&&denied});}}
const driver=id=>({name:'SYNTHETIC TEST',daCode:id,vendor:'QA',capacity:100,active:true});
const car=id=>({plate:id,model:'SYNTHETIC TEST',status:'Elérhető'});
await env.withSecurityRulesDisabled(async ctx=>{const s=ctx.firestore();for(const role of roles.filter(x=>!['unlisted','anonymous'].includes(x)))await setDoc(doc(s,'users',role),{name:'Synthetic',active:role!=='inactive',role:role==='unknown'?'unexpected':role==='inactive'?'editor':role});for(const id of ['TEST0001','TEST0002']){await setDoc(doc(s,'drivers',id),driver(id));await setDoc(doc(s,'vehicles',id),car(id));}});
function fixture(kind,key='TEST0001'){
 return Object.fromEntries(schemas[kind].fields.map(f=>[f.key,f.type==='integer'?0:f.type==='boolean'?true:f.type==='code'?key:f.type==='vehicle'?(kind==='vehicle'?key:'TEST0001'):f.type==='driver'?(kind==='driver'?key:'TEST0001'):f.type==='date'?(f.required?'2099-01-15':''):f.type==='status'?'Elérhető':f.required?'SYNTHETIC TEST':'']));
}
function envelope(kind,data,uid){return {kind,data,revision:1,createdAt:serverTimestamp(),updatedAt:serverTimestamp(),createdBy:uid,updatedBy:uid};}
async function createRecord(role,kind,key='TEST0001'){
 const record=normalizeFleetRecord(kind,fixture(kind,key));
 const batch=writeBatch(db[role]);batch.set(doc(db[role],'fleetRecords',record.id),envelope(kind,record.data,role));
 if(kind==='service')batch.update(doc(db[role],'vehicles','TEST0001'),{status:'Elérhető'});
 return batch.commit();
}
for(const role of roles){
 for(const name of ['fleetRecords','fleetAssignments','fleetDriverAssignments','fleetMovements'])
  await test(role+': '+name+' read', ['admin','editor','viewer'].includes(role),()=>getDocs(collection(db[role],name)));
 // Use distinct code IDs per role; only two canonical profiles have fixed IDs.
 for(const kind of ['phone','fuel','contact'])await test(role+': '+kind+' create',['admin','editor'].includes(role),()=>createRecord(role,kind,'TEST'+role.toUpperCase()));
}
for(const kind of ['vehicle','driver','service'])await test('admin: '+kind+' create',true,()=>createRecord('admin',kind));
for(const kind of ['vehicle','driver','service']){
 const record=normalizeFleetRecord(kind,fixture(kind,'TEST0002'));
 await test('viewer: '+kind+' denied',false,()=>setDoc(doc(db.viewer,'fleetRecords',record.id),envelope(kind,record.data,'viewer')));
}
const profile=doc(db.admin,'fleetRecords','vehicle__TEST0001');
await test('admin: valid optimistic update',true,()=>updateDoc(profile,{'data.mileage':50,revision:2,updatedAt:serverTimestamp(),updatedBy:'admin'}));
for(const [name,patch]of [
 ['stale revision',{revision:2}],['negative odometer',{'data.mileage':-1,revision:3}],
 ['unknown nested field',{'data.injected':'x',revision:3}],['unknown envelope field',{role:'admin',revision:3}],
 ['creator change',{createdBy:'editor',revision:3}],['creator timestamp change',{createdAt:serverTimestamp(),revision:3}],
 ['actor spoof',{updatedBy:'editor',revision:3}],['wrong identifier',{'data.vehicleId':'TEST0002',revision:3}],
 ['impossible date',{'data.insuranceExpiry':'2099-02-31',revision:3}],['non-date',{'data.inspectionExpiry':'x',revision:3}],
 ['extra-long text',{'data.note':'x'.repeat(2001),revision:3}],['wrong boolean',{'data.tyresChanged':'true',revision:3}],
 ['wrong numeric type',{'data.mileage':'50',revision:3}],['revision jump',{revision:4}]
])await test('admin: '+name+' denied',false,()=>updateDoc(profile,{updatedAt:serverTimestamp(),updatedBy:'admin',...patch}));
await test('viewer: valid-looking update denied',false,()=>updateDoc(doc(db.viewer,'fleetRecords','vehicle__TEST0001'),{revision:3,updatedAt:serverTimestamp(),updatedBy:'viewer'}));
await test('admin: permanent metadata deletion denied',false,()=>deleteDoc(profile));
const missing=normalizeFleetRecord('driver',fixture('driver','MISSING1'));
await test('admin: orphan metadata denied',false,()=>setDoc(doc(db.admin,'fleetRecords',missing.id),envelope('driver',missing.data,'admin')));
const service=normalizeFleetRecord('service',{...fixture('service','NEWSERVICE'),vehicleId:'TEST0001',status:'Szerviz'});
await test('admin: service without matching canonical status denied',false,()=>setDoc(doc(db.admin,'fleetRecords',service.id),envelope('service',service.data,'admin')));
await test('admin: service plus canonical status atomic',true,()=>{const b=writeBatch(db.admin);b.set(doc(db.admin,'fleetRecords',service.id),envelope('service',service.data,'admin'));b.update(doc(db.admin,'vehicles','TEST0001'),{status:'Szerviz'});return b.commit();});
await env.withSecurityRulesDisabled(ctx=>updateDoc(doc(ctx.firestore(),'vehicles','TEST0001'),{status:'Elérhető'}));
let seq=0;
function movement(role,{vehicleId='TEST0001',driverId='TEST0001',action='checkout',mileage=100,pair=true,event=true,date='2099-01-15',actor=role,extra={}}={}){
 const id=String(++seq).padStart(20,'0'),s=db[role],b=writeBatch(s);
 const a={vehicleId,driverId,active:action==='checkout',mileage,operationId:id};
 if(pair){b.set(doc(s,'fleetAssignments',vehicleId),a);b.set(doc(s,'fleetDriverAssignments',driverId),a);}
 if(event)b.set(doc(s,'fleetMovements',id),{vehicleId,driverId,action,date,mileage,note:'SYNTHETIC TEST',createdAt:serverTimestamp(),createdBy:actor,...extra});
 return b.commit();
}
for(const role of ['anonymous','unlisted','unknown','inactive','viewer'])await test(role+': checkout denied',false,()=>movement(role));
await test('editor: pair without event denied',false,()=>movement('editor',{event:false}));
await test('editor: event without pair denied',false,()=>movement('editor',{pair:false}));
await test('editor: invalid event date denied',false,()=>movement('editor',{date:'2099-02-31'}));
await test('editor: spoofed actor denied',false,()=>movement('editor',{actor:'admin'}));
await test('editor: unknown event field denied',false,()=>movement('editor',{extra:{role:'admin'}}));
await test('editor: atomic checkout allowed',true,()=>movement('editor'));
await test('admin: duplicate car checkout denied',false,()=>movement('admin',{driverId:'TEST0002'}));
await test('admin: duplicate driver checkout denied',false,()=>movement('admin',{vehicleId:'TEST0002'}));
await test('editor: decreasing mileage return denied',false,()=>movement('editor',{action:'return',mileage:99}));
await test('editor: mismatched driver return denied',false,()=>movement('editor',{action:'return',driverId:'TEST0002'}));
await test('editor: atomic return allowed',true,()=>movement('editor',{action:'return',mileage:120}));
await test('editor: repeated return denied',false,()=>movement('editor',{action:'return',mileage:120}));
await test('admin: reissue after return allowed',true,()=>movement('admin',{mileage:120,driverId:'TEST0002'}));
await test('admin: return reissued vehicle allowed',true,()=>movement('admin',{action:'return',mileage:150,driverId:'TEST0002'}));
const events=await getDocs(collection(db.admin,'fleetMovements')),first=events.docs[0].id;
await test('admin: movement edit denied',false,()=>updateDoc(doc(db.admin,'fleetMovements',first),{note:'changed'}));
await test('admin: movement delete denied',false,()=>deleteDoc(doc(db.admin,'fleetMovements',first)));
await test('admin: assignment delete denied',false,()=>deleteDoc(doc(db.admin,'fleetAssignments','TEST0001')));
await env.withSecurityRulesDisabled(ctx=>updateDoc(doc(ctx.firestore(),'vehicles','TEST0001'),{status:'Szerviz'}));
await test('admin: service vehicle checkout denied',false,()=>movement('admin',{mileage:150}));
await env.withSecurityRulesDisabled(async ctx=>{await updateDoc(doc(ctx.firestore(),'vehicles','TEST0001'),{status:'Elérhető'});await updateDoc(doc(ctx.firestore(),'drivers','TEST0001'),{active:false});});
await test('admin: inactive driver checkout denied',false,()=>movement('admin',{mileage:150}));
report.passed=report.tests.filter(x=>x.pass).length;report.failed=report.tests.filter(x=>!x.pass).length;
await fs.writeFile(process.env.IMILE_QA_REPORT_FILE||new URL('./rules-emulator-results.json',import.meta.url),JSON.stringify(report,null,2));
console.log(JSON.stringify({compiler:report.compiler,passed:report.passed,failed:report.failed,failures:report.tests.filter(x=>!x.pass)},null,2));
await env.cleanup();process.exitCode=report.failed?1:0;
