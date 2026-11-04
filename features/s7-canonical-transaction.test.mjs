import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {planSharedMigration} from './shared-master-adapter.mjs';
import {simulateCanonicalApply,protectActiveBookings} from './s7-canonical-transaction.mjs';

const fleet=(revision=1)=>({
  revision,
  vehicles:[{id:'v1',rendszam:'ABC-123',gyartmany:'Ford',modell:'Transit',
    status:'aktiv',km:1000,history:[{type:'service',note:'nested'}],
    insurance:{policy:'SYN'}}],
  drivers:[{id:'d1',daCode:'DA0001',name:'Teszt',agency:'Vendor',
    status:'aktiv',kapacitas:80,history:[{type:'assignment'}]}],
  fuelCards:[{id:'c1',lastFour:'0000'}],
  contacts:[{id:'ct1',phone:'000'}]
});
const liveOf=f=>{
  const p=planSharedMigration(f);
  assert.equal(p.ready,true,JSON.stringify(p.issues));
  return {
    liveDrivers:p.writes.drivers.map(x=>({id:x.id,...x.data})),
    liveVehicles:p.writes.vehicles.map(x=>({id:x.id,...x.data}))
  };
};
const simulate=(old,next,extra={})=>simulateCanonicalApply({
  previousFleet:old,nextFleet:next,observedFleet:structuredClone(old),
  ...liveOf(old),bookings:[],offline:false,authorized:true,
  ...extra
});

test('NO actual write is ever reported, even for a valid proposed transition',()=>{
  const old=fleet(),next=structuredClone(old);
  next.vehicles[0].status='szerviz';
  const r=simulate(old,next);
  assert.equal(r.applied,false,'Pure simulation cannot claim a committed write');
  assert.equal(r.actualWrites,0);
  assert.equal(r.simulatedReady,true);
  assert.equal(r.reason,'dry_run_only');
  assert.deepEqual(r.writes,[],'Zero actual writes');
  assert.equal(r.nextRevisionCandidate,2);
  assert.equal(r.serverVerified,false);
  assert.equal(r.liveVerified,false);
  assert.deepEqual(r.proposedWrites.map(w=>w.collection),['vehicles']);
  assert.equal(r.proposedWrites[0].proposed.status,'Szerviz');
  assert.equal('history' in r.proposedWrites[0].proposed,false);
  assert.equal('insurance' in r.proposedWrites[0].proposed,false);
});

test('history-only Fleet changes remain prospective with no Depot master projection writes',()=>{
  const old=fleet(),next=structuredClone(old);
  next.vehicles[0].km=1100;
  next.vehicles[0].history[0].note='updated';
  next.fuelCards[0].lastFour='1111';
  const r=simulate(old,next);
  assert.equal(r.simulatedReady,true);
  assert.equal(r.applied,false);
  assert.deepEqual(r.proposedWrites,[]);
  assert.equal(r.actualWrites,0);
  assert.equal(old.vehicles[0].km,1000);
  assert.equal(old.fuelCards[0].lastFour,'0000');
});

test('offline/unknown network and absent or revoked authorization fail closed',()=>{
  const old=fleet();
  for(const extra of [{offline:true},{offline:undefined},{authorized:false},{authorized:undefined}]){
    const r=simulate(old,old,extra);
    assert.equal(r.applied,false);
    assert.equal(r.simulatedReady,false);
    assert.deepEqual(r.proposedWrites,[]);
  }
  const omitted=simulateCanonicalApply({previousFleet:old,nextFleet:old,
    ...liveOf(old),bookings:[]});
  assert.equal(omitted.simulatedReady,false);
  assert.equal(omitted.applied,false);
});

test('an actual observed Fleet change is a conflict, even if revision was not advanced',()=>{
  const old=fleet(),next=structuredClone(old),server=structuredClone(old);
  next.vehicles[0].km=1100;
  server.vehicles[0].history[0].note='another browser updated history';
  const r=simulate(old,next,{observedFleet:server});
  assert.equal(r.simulatedReady,false);
  assert.equal(r.reason,'stale_server_snapshot');
  assert.deepEqual(r.proposedWrites,[]);
});
test('two same-origin browser plans may not accept a stale observed Fleet revision',()=>{
  const old=fleet(),next=structuredClone(old);
  next.drivers[0].name='Change by browser B';
  const server=fleet(2);
  const r=simulate(old,next,{observedFleet:server});
  assert.equal(r.reason,'stale_server_snapshot');
  assert.equal(r.applied,false);
});

test('input draft cannot invent a revision, and missing synthetic server read fails',()=>{
  const old=fleet(),next=structuredClone(old);
  next.revision=2;
  assert.equal(simulate(old,next).reason,'revision_mismatch');
  next.revision=1;
  assert.equal(simulate(old,next,{observedFleet:null}).reason,'server_snapshot_unverified');
  const corrupted=structuredClone(old);
  corrupted.vehicles[0].history[0].date=undefined;
  assert.equal(simulate(old,next,{observedFleet:corrupted}).reason,'invalid_snapshot');
});

test('booked vehicle cannot change ANY normalized master attribute until conflict resolved',()=>{
  const old=fleet(),next=structuredClone(old);
  next.vehicles[0].modell='Transit Custom';
  const r=simulate(old,next,{bookings:[{
    id:'b1',vehicleId:'ABC123',driverId:'OTHER',status:'confirmed'
  }]});
  assert.equal(r.reason,'active_booking_conflict');
  assert.equal(r.simulatedReady,false);
  assert.deepEqual(r.proposedWrites,[]);
  assert.deepEqual(protectActiveBookings([{id:'b1',vehicleId:'ABC123',status:'confirmed'}],['ABC123']),['b1']);
});

test('booked driver cannot change normalized name/profile while planned/confirmed',()=>{
  const old=fleet(),next=structuredClone(old);
  next.drivers[0].name='Changed';
  const r=simulate(old,next,{bookings:[{
    id:'b2',vehicleId:'OTHER',driverId:'DA0001',status:'planned'
  }]});
  assert.equal(r.reason,'active_booking_conflict');
  assert.equal(r.applied,false);
});

test('absent, stale, duplicate or drifting Depot data and incomplete bookings fail closed',()=>{
  const old=fleet(),next=structuredClone(old);
  next.vehicles[0].status='szerviz';
  for(const extra of [
    {liveVehicles:[]},{liveVehicles:undefined},
    {liveVehicles:[{...liveOf(old).liveVehicles[0],model:'wrong'}]},
    {bookings:undefined}
  ]){
    const r=simulate(old,next,extra);
    assert.equal(r.simulatedReady,false,JSON.stringify(extra));
    assert.equal(r.reason,'plan_rejected');
    assert.deepEqual(r.proposedWrites,[]);
  }
});

test('missing history/contacts and over-budget new master writes do not become successful commits',()=>{
  const old=fleet(),next=structuredClone(old);
  next.fuelCards=[];
  let r=simulate(old,next);
  assert.equal(r.applied,false);
  assert.equal(r.simulatedReady,true,'Historical-only deletion is a prospective change, still NOT applied');
  assert.deepEqual(r.proposedWrites,[]);
  for(let i=0;i<9;i++)next.vehicles.push({
    id:'n'+i,rendszam:'CAR'+String(i).padStart(4,'0'),
    gyartmany:'Test',modell:'Car',status:'aktiv'
  });
  r=simulate(old,next);
  assert.equal(r.simulatedReady,false);
  assert.equal(r.reason,'plan_rejected');
  assert.ok(r.issues.some(x=>x.reason==='too_many_atomic_master_writes'));
});

test('source contains no Firebase, filesystem, storage or network write operations',()=>{
  const src=readFileSync(new URL('./s7-canonical-transaction.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(src,/\b(?:setDoc|updateDoc|deleteDoc|writeBatch|runTransaction|fetch|localStorage|SpreadsheetApp|firebase)\s*\(/);
  assert.doesNotMatch(src,/applied:\s*true/);
});
