import assert from 'node:assert/strict';
import {projectSharedFleetSnapshot} from './flotta-master-readonly.mjs';
import {reconcileSharedMaster} from './master-reconciliation.mjs';

const trusted={loaded:true,error:false,fromCache:false,pending:false,serverAt:1730670000000};
const sources=()=>({drivers:{...trusted},vehicles:{...trusted},bookings:{...trusted}});
const fleet=()=>projectSharedFleetSnapshot({
  revision:3,
  vehicles:[
    {id:'v-1',rendszam:'ABC-123',gyartmany:'Ford',modell:'Transit',status:'aktiv',
      history:[{date:'2026-10-01',event:'serviced'}],privateVehicleField:'SECRET-DO-NOT-LEAK'}
  ],
  drivers:[
    {id:'internally-generated',daCode:'DA0001',name:'Minta Futár',
      agency:'Minta Vállalkozó',status:'aktiv',phone:'PRIVATE-000'}
  ],fuelCards:[{id:'private-fuel'}],contacts:[{id:'private-contact'}]
},{fromCache:false,hasPendingWrites:false});
const records=()=>({
  drivers:[{id:'DA0001',name:'Minta Futár',daCode:'DA0001',vendor:'Minta Vállalkozó',
    capacity:0,active:true}],
  vehicles:[{id:'ABC123',plate:'ABC123',model:'Ford Transit',status:'Elérhető'}],
  bookings:[{id:'2026-11-05__ABC123',driverId:'DA0001',vehicleId:'ABC123',
    status:'confirmed',date:'2026-11-05'}]
});
let r=reconcileSharedMaster(fleet(),records(),sources());
assert.equal(r.status,'matching');
assert.equal(r.ready,true);
assert.deepEqual(r.counts,{matching:2,different:0,onlyFleet:0,onlyDepo:0,bookingsAtRisk:0});
assert.equal(JSON.stringify(r).includes('PRIVATE-000'),false);
assert.equal(JSON.stringify(r).includes('SECRET-DO-NOT-LEAK'),false);
assert.equal(r.items.length,2);

const changed=records();
changed.drivers[0].vendor='Eltérő vállalkozó';
changed.vehicles[0].status='Szerviz';
const differing=reconcileSharedMaster(fleet(),changed,sources());
assert.equal(differing.ready,false);
assert.equal(differing.counts.different,2);
assert.ok(differing.items.some(i=>i.kind==='driver'&&i.fields.includes('vendor')));
assert.ok(differing.items.some(i=>i.kind==='vehicle'&&i.fields.includes('status')));
assert.equal(differing.counts.bookingsAtRisk,0,'Fleet side remains eligible; Depo difference is separately flagged');
assert.equal(changed.drivers[0].vendor,'Eltérő vállalkozó','Must not write to original records');

const missing=reconcileSharedMaster(fleet(),{...records(),drivers:[],vehicles:[]},sources());
assert.equal(missing.counts.onlyFleet,2);
assert.equal(missing.status,'review');
const orphans=reconcileSharedMaster(fleet(),{...records(),
  drivers:[...records().drivers,{id:'DAEXTRA',daCode:'DAEXTRA',name:'Unknown',vendor:'',capacity:0,active:false}]},sources());
assert.equal(orphans.counts.onlyDepo,1);
assert.ok(orphans.items.some(x=>x.status==='onlyDepo'));

const riskSource=projectSharedFleetSnapshot({
  revision:4,
  vehicles:[{id:'a',rendszam:'ABC123',status:'szerviz'}],
  drivers:[{id:'b',daCode:'DA0001',name:'Minta Futár',agency:'Minta Vállalkozó',status:'inaktiv'}],
  fuelCards:[],contacts:[]
},{fromCache:false,hasPendingWrites:false});
const risky=reconcileSharedMaster(riskSource,records(),sources());
assert.equal(risky.counts.bookingsAtRisk,1);
assert.ok(risky.issues.some(x=>x.reason==='booking_at_risk'&&
  x.fields.includes('driver_inactive_in_fleet')&&
  x.fields.includes('vehicle_not_available_in_fleet')));

const offline=reconcileSharedMaster(fleet(),records(),{
  ...sources(),drivers:{...trusted,fromCache:true}
});
assert.equal(offline.status,'waiting');
assert.equal(offline.ready,false);
assert.deepEqual(offline.items,[],'Cached source MUST NOT produce actionable diff');
const pending=reconcileSharedMaster(fleet(),records(),{
  ...sources(),bookings:{...trusted,pending:true}
});
assert.equal(pending.status,'waiting');
const noFleet=reconcileSharedMaster({status:'unconfirmed'},records(),sources());
assert.equal(noFleet.status,'blocked');
const corrupt=reconcileSharedMaster(fleet(),{drivers:'bad',vehicles:[],bookings:[]},sources());
assert.equal(corrupt.status,'blocked');

const duplicate=reconcileSharedMaster(fleet(),{...records(),
 drivers:[...records().drivers,{...records().drivers[0]}]},sources());
assert.equal(duplicate.status,'review');
assert.equal(duplicate.ready,false);
assert.ok(duplicate.issues.some(i=>i.reason==='depo_duplicate_or_invalid'));
assert.deepEqual(records().drivers[0],{
  id:'DA0001',name:'Minta Futár',daCode:'DA0001',vendor:'Minta Vállalkozó',
  capacity:0,active:true
},'Test fixture remains unchanged');
console.log('PASS: confirmed-only master reconciliation, duplicate checks and booking safety, no writes');
