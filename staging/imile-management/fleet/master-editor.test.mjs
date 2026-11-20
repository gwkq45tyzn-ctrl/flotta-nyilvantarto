import assert from 'node:assert/strict';
import {saveFleetMaster} from './master-editor.mjs';
const driver={id:'DA0001',daCode:'DA0001',name:'Teszt Futár',vendor:'QA',capacity:100,active:true};
const vehicle={id:'ABCD123',plate:'ABCD123',model:'Teszt',status:'Elérhető'};
const fake=()=> {
 const store=new Map();
 const doc=(db,kind,id)=>({path:kind+'/'+id});
 const runTransaction=async(db,fn)=>{
   const writes=[],tx={
     get:async ref=>({exists:()=>store.has(ref.path),data:()=>({...store.get(ref.path)})}),
     set:(ref,value)=>writes.push({path:ref.path,value:{...value}})
   };
   const result=await fn(tx);
   for(const {path,value} of writes)store.set(path,value);
   return result;
 };
 return {db:{app:{options:{projectId:'imile-management-staging'}}},doc,runTransaction,store};
};
const args=(f,kind,input,baseline)=>({...f,kind,input,baseline});
{
 const f=fake();
 const r=await saveFleetMaster(args(f,'drivers',driver,null));
 assert.deepEqual(r,{id:'DA0001',action:'created'});
 assert.deepEqual(f.store.get('drivers/DA0001'),{daCode:'DA0001',name:'Teszt Futár',vendor:'QA',capacity:100,active:true});
 await assert.rejects(saveFleetMaster(args(f,'drivers',driver,null)),/már létezik/);
 const changed=await saveFleetMaster(args(f,'drivers',{...driver,capacity:120},{...driver}));
 assert.deepEqual(changed,{id:'DA0001',action:'updated'});
 assert.equal(f.store.get('drivers/DA0001').capacity,120);
 await assert.rejects(saveFleetMaster(args(f,'drivers',{...driver,capacity:140},{...driver})),/időközben megváltozott/);
 await assert.rejects(saveFleetMaster(args(f,'drivers',{...driver,daCode:'DA0002'},{...driver})),/nem módosítható/);
}
{
 const f=fake();
 await saveFleetMaster(args(f,'vehicles',vehicle,null));
 assert.deepEqual(f.store.get('vehicles/ABCD123'),{plate:'ABCD123',model:'Teszt',status:'Elérhető'});
 await saveFleetMaster(args(f,'vehicles',{...vehicle,status:'Szerviz'},vehicle));
 assert.equal(f.store.get('vehicles/ABCD123').status,'Szerviz');
 await assert.rejects(saveFleetMaster(args(f,'vehicles',{...vehicle,plate:'NEW123'},vehicle)),/nem módosítható/);
}
{
 const f=fake(),prod={...f,db:{app:{options:{projectId:'imile-management-prod'}}}};
 await assert.rejects(saveFleetMaster(args(prod,'drivers',driver,null)),/nem engedélyezett/);
 await assert.rejects(saveFleetMaster(args(f,'bookings',driver,null)),/Érvénytelen törzstípus/);
 assert.equal(f.store.size,0);
}
console.log('PASS: shared Fleet staging-only create, edit, duplicate and stale-write guards');
