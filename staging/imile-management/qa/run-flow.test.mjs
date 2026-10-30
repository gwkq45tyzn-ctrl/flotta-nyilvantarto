import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as qa from './functional-flow.mjs';

// This offline mock verifies control-flow and cleanup. It is NOT a Firestore
// security rules emulator or a substitute for a real browser E2E test.
const source=readFileSync(new URL('./run-flow.mjs',import.meta.url),'utf8');
const stripped=source
  .replace(/^import[\s\S]*?\sfrom\s+['"][^'"]+['"];\s*$/gm,'')
  .replace('export async function executeStagingBookingQa','async function executeStagingBookingQa');
assert.doesNotMatch(stripped,/^import\s/m,'Unexpected remaining import');
function makeFake(options={}){
  const store=new Map();
  const clone=x=>x==null?x:{...x};
  const ref=(db,col,id)=>({path:col+'/'+id});
  const read=reference=>{
    const data=store.get(reference.path);
    return {exists:()=>data!==undefined,data:()=>clone(data)};
  };
  const getDoc=async reference=>read(reference);
  const setDoc=async(reference,data)=>{
    if(options.allowOverwrites){store.set(reference.path,clone(data));return;}
    const e=Error('Missing or insufficient permissions');e.code='permission-denied';throw e;
  };
  const deleteDoc=async reference=>{
    if(options.failCapacityCleanup && reference.path.startsWith('driverCapacities/'))throw Error('Simulated cleanup failure');
    store.delete(reference.path);
  };
  const runTransaction=async (db,callback)=>{
    const writes=[];
    const tx={
      get:async reference=>read(reference),
      set:(reference,data)=>writes.push({type:'set',path:reference.path,data:clone(data)}),
      delete:(reference)=>writes.push({type:'delete',path:reference.path})
    };
    const value=await callback(tx);
    if(options.failBookingWrite && writes.some(w=>w.path.startsWith('bookings/')&&w.type==='set'))
      throw Error('Simulated booking commit failure');
    for(const w of writes){
      if(w.type==='set')store.set(w.path,w.data);
      else store.delete(w.path);
    }
    return value;
  };
  store.set('drivers/'+qa.QA_DRIVER_ID,{...qa.QA_DRIVER});
  store.set('vehicles/'+qa.QA_CAR_ID,{...qa.QA_CAR});
  if(options.existingCapacity)store.set('driverCapacities/'+qa.QA_DRIVER_ID,{capacity:100});
  if(options.foreignMaster)store.set('drivers/'+qa.QA_DRIVER_ID,{...qa.QA_DRIVER,vendor:'NOT_QA'});
  if(options.preexistingBooking)store.set('bookings/'+qa.QA_BOOKING_ID,{...qa.QA_BOOKING});
  const fire={
    doc:ref,getDoc,setDoc,deleteDoc,runTransaction,
    ...qa
  };
  const execute=new Function(...Object.keys(fire),stripped+'\nreturn executeStagingBookingQa;')(...Object.values(fire));
  const db={app:{options:{projectId:'imile-management-staging'}}};
  return {execute,db,store};
}

const expectClean=f=>{
  assert.equal(f.store.has('bookings/'+qa.QA_BOOKING_ID),false);
  assert.equal(f.store.has('driverClaims/'+qa.QA_CLAIM_ID),false);
  assert.equal(f.store.has('drivers/'+qa.QA_DRIVER_ID),true);
  assert.equal(f.store.has('vehicles/'+qa.QA_CAR_ID),true);
};
{
 const f=makeFake(),messages=[];
 const result=await f.execute(f.db,x=>messages.push(x));
 assert.equal(result.capacity,100);
 assert.equal(result.bookingAndClaimRemoved,true);
 assert.equal(f.store.has('driverCapacities/'+qa.QA_DRIVER_ID),false);
 assert.ok(messages.some(x=>x.includes('tiltva')));
 assert.ok(messages.some(x=>x.includes('feloldva')));
 expectClean(f);
}
{
 const f=makeFake({existingCapacity:true});
 await f.execute(f.db);
 assert.deepEqual(f.store.get('driverCapacities/'+qa.QA_DRIVER_ID),{capacity:100});
 expectClean(f);
}
{
 const f=makeFake({foreignMaster:true});
 await assert.rejects(f.execute(f.db),/eltérnek/);
 assert.equal(f.store.has('driverCapacities/'+qa.QA_DRIVER_ID),false);
 expectClean(f);
}
{
 const f=makeFake({preexistingBooking:true});
 await assert.rejects(f.execute(f.db),/már van tesztfoglalás/);
 assert.equal(f.store.has('bookings/'+qa.QA_BOOKING_ID),true);
}
{
 const f=makeFake({failBookingWrite:true});
 await assert.rejects(f.execute(f.db),/commit failure/);
 expectClean(f);
 assert.equal(f.store.has('driverCapacities/'+qa.QA_DRIVER_ID),false);
}
{
 const f=makeFake({allowOverwrites:true});
 await assert.rejects(f.execute(f.db),/Biztonsági hiba/);
 expectClean(f);
}
{
 const f=makeFake({failCapacityCleanup:true});
 await assert.rejects(f.execute(f.db),/VISSZAMARADT REKORD LEHETSÉGES/);
 expectClean(f);
 assert.equal(f.store.has('driverCapacities/'+qa.QA_DRIVER_ID),true);
}
{
 const f=makeFake();
 await assert.rejects(f.execute({app:{options:{projectId:'not-staging'}}}),/nem staging/);
 expectClean(f);
}
console.log('PASS: 8 offline booking flows (success, old capacity, rollback, duplicate, permissions, staging guard)');
