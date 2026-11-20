import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {planSharedMigration} from './shared-master-adapter.mjs';
import {planCanonicalMasterTransition} from './fleet-depo-canonical-transition.mjs';

const fleet=()=>({
  revision:2,
  vehicles:[{id:'legacy-car-001',rendszam:'ABC-123',gyartmany:'Ford',modell:'Transit',
    status:'aktiv',km:1234,insuranceExpiry:'2027-01-01',
    history:[{date:'2026-10-01',type:'service',note:'synthetic'}]}],
  drivers:[{id:'legacy-driver-001',daCode:'DA0001',name:'Synthetic Courier',
    agency:'Synthetic Vendor',status:'aktiv',kapacitas:80,
    history:[{date:'2026-10-01',type:'assignment'}]}],
  fuelCards:[{id:'SYNTHETIC_PRIVATE',lastFour:'0000'}],
  contacts:[{id:'SYNTHETIC_CONTACT',phone:'000-000'}]
});
function current(original){
  const p=planSharedMigration(original);
  assert.equal(p.ready,true,JSON.stringify(p.issues));
  return {
    liveDrivers:p.writes.drivers.map(x=>({id:x.id,...x.data})),
    liveVehicles:p.writes.vehicles.map(x=>({id:x.id,...x.data}))
  };
}
const check=(old,next,opts={})=>
  planCanonicalMasterTransition({
    previousFleet:old,nextFleet:next,...current(old),bookings:[],
    ...opts
  });

test('unchanged and historical-only edits preserve full original Fleet sidecars',()=>{
  const before=fleet(),after=structuredClone(before);
  after.vehicles[0].history[0].note='Changed private history';
  after.fuelCards.push({id:'another-synthetic-private-card'});
  const frozen=structuredClone(before),proposed=structuredClone(after);
  const result=check(before,after);
  assert.equal(result.ready,true);
  assert.deepEqual(result.writes,[]);
  assert.equal(result.proposedRevision,3);
  assert.deepEqual(before,frozen,'Source snapshot must remain unmodified');
  assert.deepEqual(after,proposed,'Target snapshot must remain unmodified');
  assert.equal('source' in result,false,'Private full source must not leak to plan');
});

test('Fleet vehicle status and driver profile edits produce normalized Depot atomic writes',()=>{
  const before=fleet(),next=structuredClone(before);
  next.vehicles[0].status='szerviz';
  next.drivers[0].name='Synthetic Courier Updated';
  const r=check(before,next);
  assert.equal(r.ready,true);
  assert.equal(r.counts.updates,2);
  assert.equal(r.counts.creates,0);
  assert.deepEqual(r.writes.map(x=>x.collection).sort(),['drivers','vehicles']);
  const car=r.writes.find(x=>x.collection==='vehicles');
  assert.equal(car.id,'ABC123');
  assert.equal(car.expectedPrevious.status,'Elérhető');
  assert.equal(car.proposed.status,'Szerviz');
  const driver=r.writes.find(x=>x.collection==='drivers');
  assert.equal(driver.id,'DA0001');
  assert.equal(driver.proposed.name,'Synthetic Courier Updated');
  assert.equal('flotta' in driver.proposed,false,'No private Fleet history in strict Depot write');
});

test('new Fleet car is a create, not an implicit overwrite or deletion',()=>{
  const before=fleet(),next=structuredClone(before);
  next.vehicles.push({id:'new',rendszam:'XYZ-789',gyartmany:'Ford',
    modell:'Transit',status:'aktiv',history:[]});
  const r=check(before,next);
  assert.equal(r.ready,true);
  assert.equal(r.counts.creates,1);
  assert.deepEqual(r.writes.map(x=>({collection:x.collection,id:x.id,operation:x.operation})),
    [{collection:'vehicles',id:'XYZ789',operation:'create'}]);
  assert.equal(r.writes[0].expectedPrevious,null);
});

test('a booked vehicle or driver cannot be made ineligible silently',()=>{
  const before=fleet(),next=structuredClone(before);
  next.vehicles[0].status='Szerviz';
  let r=check(before,next,{bookings:[{
    date:'2099-01-01',vehicleId:'ABC123',driverId:'DA0001',status:'confirmed'
  }]});
  assert.equal(r.ready,false);
  assert.ok(r.issues.some(x=>x.reason==='existing_booking_would_lose_eligible_master'));
  assert.deepEqual(r.writes,[]);
  next.vehicles[0].status='aktiv';
  next.drivers[0].status='inaktiv';
  r=check(before,next,{bookings:[{
    date:'2099-01-01',vehicleId:'ABC123',driverId:'DA0001',status:'planned'
  }]});
  assert.equal(r.ready,false);
  assert.ok(r.issues.some(x=>x.reason==='existing_booking_would_lose_eligible_master'));
});

test('out-of-band Depot master drift, extras and partial reads block changes',()=>{
  const before=fleet(),next=structuredClone(before);
  next.vehicles[0].modell='Custom';
  const live=current(before);
  live.liveVehicles[0].status='Szerviz'; // someone modified Depot separately
  let result=check(before,next,live);
  assert.equal(result.ready,false);
  assert.ok(result.issues.some(x=>x.reason==='fleet_depot_existing_master_drift'));
  result=check(before,next,{liveVehicles:[]});
  assert.equal(result.ready,false);
  assert.ok(result.issues.some(x=>x.reason==='fleet_depot_record_count_drift'));
  result=check(before,next,{liveDrivers:[...current(before).liveDrivers,
    {id:'DA9999',name:'Extra',daCode:'DA9999',vendor:'',capacity:0,active:true}]});
  assert.equal(result.ready,false);
  assert.ok(result.issues.some(x=>x.reason==='depot_only_master_requires_review'));
  result=check(before,next,{liveDrivers:undefined});
  assert.equal(result.ready,false);
  assert.ok(result.issues.some(x=>x.reason==='unconfirmed_master_collection'));
  result=check(before,next,{liveDrivers:[{...current(before).liveDrivers[0],extra:'x'}]});
  assert.equal(result.ready,false);
  assert.ok(result.issues.some(x=>x.reason==='fleet_depot_existing_master_drift'));
});

test('deletion, duplicate IDs, unverified revision and missing booking source fail closed',()=>{
  const before=fleet(),next=structuredClone(before);
  next.vehicles=[];
  assert.ok(check(before,next).issues.some(x=>x.reason==='original_fleet_master_deletion_requires_manual_migration'));
  next.vehicles=[before.vehicles[0],{...before.vehicles[0],id:'second'}];
  assert.ok(check(before,next).issues.some(x=>x.reason==='duplicate_or_invalid_master_projection'));
  next.vehicles=[before.vehicles[0]];
  assert.equal(check({...before,revision:0},next).ready,false);
  assert.ok(check(before,next,{bookings:undefined}).issues.some(x=>x.reason==='unconfirmed_booking_collection'));
  assert.ok(check(before,next,{maxWrites:0}).issues.some(x=>x.reason==='invalid_transaction_budget'));
});

test('batching beyond conservative transaction budget must not be silently partial',()=>{
  const before=fleet(),next=structuredClone(before);
  for(let i=0;i<9;i++)next.vehicles.push({
    id:'generated-'+i,rendszam:'CAR'+String(i).padStart(4,'0'),
    gyartmany:'Synthetic',modell:'Test',status:'aktiv'
  });
  const result=check(before,next);
  assert.equal(result.ready,false);
  assert.ok(result.issues.some(x=>x.reason==='too_many_atomic_master_writes'));
  assert.deepEqual(result.writes,[],'No partial apply plan when capacity exceeded');
});

test('planner contains NO Firebase writes, IO or real-data access',()=>{
  const source=readFileSync(new URL('./fleet-depo-canonical-transition.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(source,/\b(?:setDoc|updateDoc|deleteDoc|runTransaction|writeBatch|firebase|fetch|readFile)\s*\(/);
  assert.doesNotMatch(source,/console\.log|process\.env|service_account|GoogleAuth/);
});
