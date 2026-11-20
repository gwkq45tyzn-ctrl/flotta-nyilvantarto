/**
 * Actual local Firebase emulator proof that a trusted EMPTY base plus
 * Rules-checked single-entry count deltas can enforce DA and plate uniqueness
 * even though Rules cannot iterate a whole legacy Fleet array.
 *
 * THIS IS AN ISOLATED SCHEMA PROTOTYPE, NOT ACTUAL INTEGRATED IMILE RULES.
 * A successful test does not prove production, trusted migration, old writer
 * cutover, rich original Fleet UI preservation, or all five #133 cases.
 */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import {doc,setDoc,getDoc,updateDoc} from 'firebase/firestore';

const raw=await readFile(new URL('./v1-counted-identity-induction.rules',import.meta.url),'utf8');
const env=await initializeTestEnvironment({
  projectId:'demo-imile-identity-induction',
  firestore:{host:'127.0.0.1',port:8787,rules:raw}
});
const editor=env.authenticatedContext('synthetic-v1-editor').firestore();
const other=env.authenticatedContext('synthetic-v1-stranger').firestore();
const path=db=>doc(db,'countedFleet','current');
const record=(daCode,extra={})=>({daCode,status:'aktiv',capacity:50,history:[{type:'original',note:'synthetic'}],...extra});
const car=(rendszam,extra={})=>({rendszam,status:'aktiv',history:[{type:'original',note:'synthetic'}],...extra});
const fresh=()=>({
  revision:1,sealed:false,drivers:[],vehicles:[],
  identity:{daCnt:{},plateCnt:{}},
  lastChange:{drivers:{op:'none',index:-1},vehicles:{op:'none',index:-1}}
});
const clone=o=>structuredClone(o);
const key=(r,kind)=>kind==='drivers' ? r.daCode.toUpperCase() :
  r.rendszam.replace(/[ -]/g,'').toUpperCase();
const countField=kind=>kind==='drivers'?'daCnt':'plateCnt';
async function next(op,kind,index,item){
  const old=(await getDoc(path(editor))).data();
  const n=clone(old);
  n.revision=old.revision+1;
  n.sealed=false;
  n.lastChange={drivers:{op:'none',index:-1},vehicles:{op:'none',index:-1}};
  n.lastChange[kind]={op,index};
  const previous=op==='insert'?null:old[kind][index];
  if(op==='insert')n[kind].splice(index,0,item);
  else if(op==='delete')n[kind].splice(index,1);
  else if(op==='edit')n[kind][index]=item;
  else throw Error('unexpected operation');
  const cnt=n.identity[countField(kind)];
  if(previous) {const k=key(previous,kind);cnt[k]--;if(cnt[k]===0)delete cnt[k];}
  if(item){const k=key(item,kind);cnt[k]=(cnt[k]||0)+1;}
  return n;
}
const save=n=>setDoc(path(editor),n);
async function checkAllowed(label,action){
  await action();
  console.log('PASS ALLOW [E+SDK] '+label);
}
async function checkDenied(label,action){
  try{await action();}
  catch(error){
    if(error.code!=='permission-denied')throw Error('Unexpected '+label+': '+error.message,{cause:error});
    console.log('PASS DENY [E+SDK] '+label);return;
  }
  throw Error('SECURITY FAIL: authenticated direct SDK ALLOWED '+label);
}
const booking=(day,driverId,vehicleId,driverIndex=0,vehicleIndex=0)=>
  setDoc(doc(editor,'countedBookings',day),{driverId,vehicleId,driverIndex,vehicleIndex});
const seal=async()=>{const before=(await getDoc(path(editor))).data();const n=clone(before);
  n.revision++;n.sealed=true;
  n.lastChange={drivers:{op:'none',index:-1},vehicles:{op:'none',index:-1}};
  await save(n);
};
async function reset(){
  await env.clearFirestore();
  await setDoc(path(editor),fresh());
}

try{
  // No server privilege is needed for the base because ONLY EMPTY source
  // creation is allowed: count invariants hold trivially at revision 1.
  await reset();
  await checkDenied('cannot create populated or poisoned Fleet baseline',async()=>{
    await env.clearFirestore();
    const injected=fresh();
    injected.drivers=[record('DA-0001')];
    injected.identity.daCnt={'DA-0001':1};
    await setDoc(path(editor),injected);
  });
  await reset();
  await checkDenied('unauthorized user cannot mutate empty Fleet',()=>updateDoc(path(other),{revision:2}));

  await checkAllowed('first valid DA insert into empty Fleet',async()=>
    save(await next('insert','drivers',0,record('DA-0001'))));
  await checkAllowed('first valid vehicle insert into empty Fleet',async()=>
    save(await next('insert','vehicles',0,car('TEST-0001'))));
  await checkAllowed('distinct DA underscore code insertion',async()=>
    save(await next('insert','drivers',1,record('DA_0002'))));
  const original=(await getDoc(path(editor))).data();
  assert.deepEqual(original.identity.daCnt,{'DA-0001':1,DA_0002:1});
  assert.deepEqual(original.identity.plateCnt,{'TEST0001':1});

  await checkDenied('duplicate business DA on one-row insert with forged count',async()=>{
    const n=await next('insert','drivers',2,record('da-0001',{capacity:500}));
    await save(n);
  });
  await checkDenied('duplicate normalized plate on one-row insert',async()=>{
    const n=await next('insert','vehicles',1,car('TEST0001',{status:'aktiv'}));
    await save(n);
  });
  await checkDenied('direct SDK count map poison without source edit',async()=>{
    const n=clone((await getDoc(path(editor))).data());
    n.revision++;n.identity.daCnt['DA-0001']=2;
    await save(n);
  });
  await checkDenied('two-row edit disguised as one selected index',async()=>{
    const n=clone((await getDoc(path(editor))).data());
    n.revision++;n.drivers[0].capacity=500;n.drivers[1].capacity=500;
    n.lastChange.drivers={op:'edit',index:0};
    await save(n);
  });
  await checkDenied('forged index when a different DA row changes',async()=>{
    const n=clone((await getDoc(path(editor))).data());
    n.revision++;n.drivers[1].status='szerviz';
    n.lastChange.drivers={op:'edit',index:0};
    await save(n);
  });
  await checkDenied('fake revision skip on otherwise valid edit',async()=>{
    const n=await next('edit','drivers',0,record('DA-0001',{capacity:70}));
    n.revision+=1;await save(n);
  });
  await checkAllowed('valid rich history and capacity edit at first index',async()=>{
    const n=await next('edit','drivers',0,record('DA-0001',{capacity:70,history:[{type:'service',note:'preserved'}]}));
    await save(n);
  });
  await checkAllowed('valid rich history edit at LAST index',async()=>{
    const n=await next('edit','drivers',1,record('DA_0002',{capacity:80,history:[{type:'assignment',note:'original'}]}));
    await save(n);
  });
  await checkAllowed('valid DA rename does not erase OTHER driver records',async()=>{
    const before=(await getDoc(path(editor))).data();
    const n=await next('edit','drivers',1,{...before.drivers[1],daCode:'DA0002'});
    await save(n);
  });
  const afterRename=(await getDoc(path(editor))).data();
  assert.deepEqual(afterRename.identity.daCnt,{'DA-0001':1,DA0002:1});
  assert.equal(afterRename.drivers[0].history[0].note,'preserved');

  await checkDenied('booking must reject partial unsealed Fleet',()=>
    booking('2099-01-01','DA-0001','TEST0001'));
  await checkAllowed('seal after no-row-change final review',seal);
  await checkAllowed('book unique actual DA and plate',()=>
    booking('2099-01-02','DA-0001','TEST0001'));
  await checkDenied('forged second driver index cannot book a first DA',()=>
    booking('2099-01-03','DA-0001','TEST0001',1,0));
  await checkDenied('unknown DA identity cannot book',()=>
    booking('2099-01-04','FAKEDA','TEST0001'));
  await checkDenied('noncanonical plate ID cannot book',()=>
    booking('2099-01-05','DA-0001','TEST-0001'));
  await checkDenied('Unicode lookalike cannot book',()=>
    booking('2099-01-06','DA\u01310001','TEST0001'));
  await checkAllowed('unseal without changing source rows',async()=>{
    const n=clone((await getDoc(path(editor))).data());n.revision++;n.sealed=false;await save(n);
  });
  await checkAllowed('legitimate vehicle plate rename',async()=>{
    const n=await next('edit','vehicles',0,car('TEST-0002'));await save(n);
  });
  await checkAllowed('delete last DA row and decrement count',async()=>{
    const n=await next('delete','drivers',1);await save(n);
  });
  await checkAllowed('reinsert DA that was previously removed',async()=>{
    const n=await next('insert','drivers',1,record('DA0002'));await save(n);
  });
  await seal();
  await checkAllowed('book new normalized plate and DA after rename',()=>
    booking('2099-01-07','DA0002','TEST0002',1,0));

  // Privileged writers are not governed by Rules. This synthetic fixture
  // shows that TRUE source/count invariants depend on approved cutover.
  // A poisoned trusted seed can lie about uniqueness, so this test is a
  // documented negative limitation, not a claimed P0 release fix.
  await env.withSecurityRulesDisabled(async ctx=>{
    await setDoc(path(ctx.firestore()),{
      ...fresh(),revision:100,sealed:true,
      drivers:[record('DA-0001'),record('da-0001')],
      vehicles:[car('TEST0001'),car('TEST-0001')],
      identity:{daCnt:{'DA-0001':1},plateCnt:{TEST0001:1}}
    });
  });
  await checkAllowed('KNOWN PRIVILEGED-WRITER LIMITATION: poisoned count can book',()=>
    booking('2099-01-08','DA-0001','TEST0001',1,1));
  console.log('COUNTED IDENTITY PROOF PASS: supported Firestore Rules operations '+ 
    'inductively enforce DA + PLATE uniqueness from EMPTY base for checked SDK writes.');
  console.log('RELEASE NOT AUTHORIZED: privileged Admin/Apps Script writes can corrupt the base; '+
    'integrated iMile Rules, migration, original UI, backup/restore, 1MiB limits and #133 still unproven.');
} finally {await env.cleanup();}
