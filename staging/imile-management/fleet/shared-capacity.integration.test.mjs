import assert from 'node:assert/strict';
import {saveFleetMaster} from './master-editor.mjs';
import {eligibleDriver,eligibleVehicle,assessBooking,effectiveCapacity} from '../../../depokapacitas/capacity-eligibility.mjs';

// All operations stay in memory: this verifies the shared data contract and
// Fleet→Depo capacity behavior without contacting any Firebase project.
const store=new Map();
const db={app:{options:{projectId:'imile-management-staging'}}};
const doc=(database,kind,id)=>({path:kind+'/'+id});
const runTransaction=async(database,fn)=>{
  const writes=[];
  const tx={
    get:async ref=>({exists:()=>store.has(ref.path),data:()=>({...store.get(ref.path)})}),
    set:(ref,data)=>writes.push({path:ref.path,data:{...data}})
  };
  const result=await fn(tx);
  for(const row of writes)store.set(row.path,row.data);
  return result;
};
const write=(kind,input,baseline=null)=>saveFleetMaster({db,kind,input,baseline,doc,runTransaction});
const driver={daCode:'DAQA01',name:'Szintetikus futár',vendor:'QA',capacity:'100',active:'true'};
const car={plate:'QACAR01',model:'Szintetikus autó',status:'Elérhető'};
await write('drivers',driver);
await write('vehicles',car);
let d={id:driver.daCode,...store.get('drivers/'+driver.daCode)};
let v={id:car.plate,...store.get('vehicles/'+car.plate)};
assert.equal(eligibleDriver(d),true);
assert.equal(eligibleVehicle(v),true);
const booking={date:'2099-01-15',driverId:d.id,vehicleId:v.id,capacity:100};
assert.deepEqual(assessBooking(booking,[d],[v],'2026-10-30'),{eligible:true,reason:'available'});
assert.equal(effectiveCapacity(booking,[d],[v],'2026-10-30'),100);
await assert.rejects(write('vehicles',car),/már létezik/);
await write('vehicles',{...car,status:'Szerviz'},v);
v={id:car.plate,...store.get('vehicles/'+car.plate)};
assert.equal(eligibleVehicle(v),false);
assert.equal(effectiveCapacity(booking,[d],[v],'2026-10-30'),0);
assert.deepEqual(assessBooking(booking,[d],[v],'2026-10-30'),{eligible:false,reason:'vehicle_unavailable'});
await write('drivers',{...driver,active:'false'},d);
d={id:driver.daCode,...store.get('drivers/'+driver.daCode)};
assert.equal(eligibleDriver(d),false);
assert.deepEqual(assessBooking(booking,[d],[v],'2026-10-30'),{eligible:false,reason:'driver_inactive'});
assert.equal(effectiveCapacity(booking,[d],[v],'2026-10-30'),0);
console.log('PASS: staging Fleet master edits change shared Depo booking eligibility and capacity');
