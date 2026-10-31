import assert from 'node:assert/strict';
import {schemas,normalizeFleetRecord,expiryWarnings,validDate} from './operations-data.mjs';
import {saveFleetRecord,moveFleetVehicle} from './operations-store.mjs';
let count=0;const test=async(name,fn)=>{await fn();count++;};
export function fixture(kind){return Object.fromEntries(schemas[kind].fields.map(f=>[f.key,f.type==='integer'?0:f.type==='boolean'?true:f.type==='vehicle'?'TESTCAR01':f.type==='driver'?'SYNTHETIC_TEST':f.type==='date'?(f.required?'2099-01-15':''):f.type==='status'?'Elérhető':f.type==='code'?'SYNTEST01':f.required?'SYNTHETIC TEST':'']));}
for(const kind of Object.keys(schemas))await test(kind+' validates',()=>{assert.equal(normalizeFleetRecord(kind,fixture(kind)).kind,kind);});
for(const date of ['2026-02-29','2099-02-31','2026-04-31','2026-00-01','2200-01-01'])await test('reject '+date,()=>assert.equal(validDate(date),false));
await test('leap dates',()=>assert.ok(validDate('2000-02-29')&&validDate('2028-02-29')));
await test('negative integer',()=>assert.throws(()=>normalizeFleetRecord('vehicle',{...fixture('vehicle'),mileage:-1})));
await test('fractional integer',()=>assert.throws(()=>normalizeFleetRecord('service',{...fixture('service'),cost:'1.5'})));
await test('invalid boolean',()=>assert.throws(()=>normalizeFleetRecord('phone',{...fixture('phone'),active:'yes'})));
await test('invalid code',()=>assert.throws(()=>normalizeFleetRecord('phone',{...fixture('phone'),code:'../secret'})));
await test('oversize text',()=>assert.throws(()=>normalizeFleetRecord('driver',{...fixture('driver'),note:'x'.repeat(2001)})));
await test('expiry report',()=>assert.deepEqual(expiryWarnings([{id:'v',data:{insuranceExpiry:'2026-10-29',cascoExpiry:'2026-12-29',rentalExpiry:'2027-01-01'}}],'2026-10-30').map(x=>x.days),[-1,60]));
function backend(){
 const records=new Map([['vehicles/TESTCAR01',{plate:'TESTCAR01',model:'Synthetic',status:'Elérhető'}],['drivers/SYNTHETIC_TEST',{daCode:'SYNTHETIC_TEST',name:'Synthetic',vendor:'QA',capacity:100,active:true}]]);let seq=0;
 const doc=(...args)=>args.length===1?args[0]+'/'+String(++seq).padStart(20,'0'):args.slice(1).join('/');
 const collection=(_,c)=>c;
 const runTransaction=async(_,fn)=>{const pending=[];const value=await fn({get:async key=>({exists:()=>records.has(key),data:()=>records.get(key)}),set:(key,val)=>pending.push(()=>records.set(key,val)),update:(key,val)=>pending.push(()=>{const row=structuredClone(records.get(key));for(const [field,value]of Object.entries(val)){const parts=field.split('.');if(parts.length===2)row[parts[0]][parts[1]]=value;else row[field]=value;}records.set(key,row);})});pending.forEach(fn=>fn());return value;};
 return {db:{app:{options:{projectId:'imile-management-staging'}}},records,uid:'synthetic-admin',doc,collection,runTransaction,serverTimestamp:()=>1};
}
await test('create and optimistic update',async()=>{const ctx=backend();const input=fixture('vehicle');const id=await saveFleetRecord({...ctx,kind:'vehicle',input});assert.equal(id,'vehicle__TESTCAR01');const base={id,...ctx.records.get('fleetRecords/'+id)};await saveFleetRecord({...ctx,kind:'vehicle',input:{...input,mileage:42},baseline:base});assert.equal(ctx.records.get('fleetRecords/'+id).revision,2);await assert.rejects(saveFleetRecord({...ctx,kind:'vehicle',input,baseline:base}),/megváltozott|megváltozott/);});
await test('duplicate create',async()=>{const ctx=backend();await saveFleetRecord({...ctx,kind:'driver',input:fixture('driver')});await assert.rejects(saveFleetRecord({...ctx,kind:'driver',input:fixture('driver')}));});
await test('missing foreign key',async()=>{const ctx=backend();await assert.rejects(saveFleetRecord({...ctx,kind:'vehicle',input:{...fixture('vehicle'),vehicleId:'NONE1234'}}),/Hiányzó/);assert.equal(ctx.records.size,2);});
await test('service atomically updates canonical vehicle',async()=>{const ctx=backend();await saveFleetRecord({...ctx,kind:'service',input:{...fixture('service'),status:'Szerviz'}});assert.equal(ctx.records.get('vehicles/TESTCAR01').status,'Szerviz');});
await test('production guard',async()=>{const ctx=backend();ctx.db.app.options.projectId='production';await assert.rejects(saveFleetRecord({...ctx,kind:'driver',input:fixture('driver')}),/staging/);});
const move={vehicleId:'TESTCAR01',driverId:'SYNTHETIC_TEST',date:'2099-01-15',mileage:'100',note:'SYNTHETIC TEST',action:'checkout'};
await test('checkout duplicate and return',async()=>{const ctx=backend();await moveFleetVehicle({...ctx,input:move});assert.equal(ctx.records.get('fleetAssignments/TESTCAR01').active,true);await assert.rejects(moveFleetVehicle({...ctx,input:move}),/aktív kiadás/);await assert.rejects(moveFleetVehicle({...ctx,input:{...move,action:'return',mileage:'99'}}),/csökkenhet/);await moveFleetVehicle({...ctx,input:{...move,action:'return',mileage:'120'}});assert.equal(ctx.records.get('fleetAssignments/TESTCAR01').active,false);assert.equal([...ctx.records.keys()].filter(x=>x.startsWith('fleetMovements/')).length,2);});
await test('inactive driver denied',async()=>{const ctx=backend();ctx.records.get('drivers/SYNTHETIC_TEST').active=false;await assert.rejects(moveFleetVehicle({...ctx,input:move}));});
await test('service car denied',async()=>{const ctx=backend();ctx.records.get('vehicles/TESTCAR01').status='Szerviz';await assert.rejects(moveFleetVehicle({...ctx,input:move}));});
await test('unmatched return denied',async()=>{const ctx=backend();await assert.rejects(moveFleetVehicle({...ctx,input:{...move,action:'return'}}));});
await test('handover updates shared odometer',async()=>{const ctx=backend();await saveFleetRecord({...ctx,kind:'vehicle',input:{...fixture('vehicle'),mileage:100}});await moveFleetVehicle({...ctx,input:move});await moveFleetVehicle({...ctx,input:{...move,action:'return',mileage:'120'}});assert.equal(ctx.records.get('fleetRecords/vehicle__TESTCAR01').data.mileage,120);});
await test('metadata odometer cannot decrease',async()=>{const ctx=backend();const id=await saveFleetRecord({...ctx,kind:'vehicle',input:{...fixture('vehicle'),mileage:100}});await assert.rejects(saveFleetRecord({...ctx,kind:'vehicle',baseline:{id,...ctx.records.get('fleetRecords/'+id)},input:{...fixture('vehicle'),mileage:99}}),/csökkenhet/);});
await test('service raises shared odometer',async()=>{const ctx=backend();await saveFleetRecord({...ctx,kind:'vehicle',input:fixture('vehicle')});await saveFleetRecord({...ctx,kind:'service',input:{...fixture('service'),mileage:200,status:'Szerviz'}});assert.equal(ctx.records.get('fleetRecords/vehicle__TESTCAR01').data.mileage,200);});
console.log('PASS: '+count+' Fleet schema, expiry, optimistic write, service and handover cases');
