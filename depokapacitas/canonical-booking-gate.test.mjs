import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {planSharedMigration} from '../features/shared-master-adapter.mjs';
import {assessCanonicalBookingMaster as assess} from './canonical-booking-gate.mjs';

const SHA='a'.repeat(64);
const uid='synthetic-internal-uid';
const fleet=()=>({
  revision:7,migrationSourceSha256:SHA,
  vehicles:[{id:'internal-car',rendszam:'ABC-123',gyartmany:'Ford',modell:'Transit',
    status:'aktiv',history:[{date:'2026-10-01',note:'Synthetic history'}]}],
  drivers:[{id:'original-id',daCode:'DA0001',name:'Synthetic Driver',
    agency:'Synthetic Vendor',kapacitas:80,status:'aktiv',
    history:[{kind:'assignment'}]}],
  fuelCards:[{id:'synthetic-card',history:[{kind:'fuel'}]}],
  contacts:[{id:'synthetic-contact',phone:'000'}]
});
const present=()=>({
  approval:{status:'approved',approvedUid:uid,sourceSha256:SHA},
  uid,driverId:'DA0001',vehicleId:'ABC123'
});
function params(){
  const f=fleet(),plan=planSharedMigration(f);
  assert.equal(plan.ready,true);
  return {
    ...present(),fleet:f,
    depotDriver:{id:'DA0001',...plan.writes.drivers[0].data},
    depotVehicle:{id:'ABC123',...plan.writes.vehicles[0].data}
  };
}
const reasons=(x)=>assess(x).code;
test('server-read canonical fully matched booking can be proposed, never marked saved',()=>{
  const state=params(),before=structuredClone(state);
  const p=assess(state);
  assert.equal(p.ready,true);
  assert.equal(p.code,'server_read_parity_ready');
  assert.equal(p.fleetRevision,7);
  assert.equal('applied' in p,false);
  assert.equal('saved' in p,false);
  assert.deepEqual(state,before);
});
test('no approval, wrong UID or forged 64-character hash deny booking',()=>{
  const a=params();
  for(const option of [
    {approval:null},
    {approval:{...a.approval,status:'pending'}},
    {approval:{...a.approval,approvedUid:'another-uid'}},
    {approval:{...a.approval,sourceSha256:'UNVERIFIED'}},
    {approval:{...a.approval,sourceSha256:'b'.repeat(64)}},
    {uid:'another-uid'}
  ]){
    const b={...a,...option};
    assert.equal(assess(b).ready,false,JSON.stringify(option));
  }
});
test('the original Fleet must have an immutable imported source-id link',()=>{
  const a=params();
  delete a.fleet.migrationSourceSha256;
  assert.equal(reasons(a),'fleet_source_not_attested');
  a.fleet.migrationSourceSha256='b'.repeat(64);
  assert.equal(reasons(a),'fleet_source_not_attested');
  a.fleet.migrationSourceSha256=SHA;
  a.fleet.revision=0;
  assert.equal(reasons(a),'fleet_source_not_attested');
});
test('a changed Fleet revision from another browser aborts',()=>{
  const a=params();
  a.expectedFleetRevision=6;
  assert.equal(reasons(a),'fleet_revision_changed');
  a.expectedFleetRevision=7;
  assert.equal(assess(a).ready,true);
});
test('out-of-band legacy Depot mirrors cannot override canonical Fleet eligibility',()=>{
  const a=params();
  a.depotDriver.name='STALE';
  assert.equal(reasons(a),'server_read_parity_ready');
  a.depotVehicle.status='Szerviz'; // A forged mirror cannot block an eligible Fleet car.
  assert.equal(reasons(a),'server_read_parity_ready');
  a.depotVehicle.extraHistory='must not enter canonical projection';
  assert.equal(reasons(a),'server_read_parity_ready');
  // Even a forged AVAILABLE mirror must not override a Fleet service stop.
  a.fleet.vehicles[0].status='szerviz';
  a.depotVehicle.status='Elérhető';
  assert.equal(reasons(a),'ineligible_fleet_master');
});
test('Fleet master edits remain authoritative, regardless of stale Depot mirror',()=>{
  const a=params();
  a.fleet.vehicles[0].status='szerviz';
  assert.equal(reasons(a),'ineligible_fleet_master');
  a.fleet=params().fleet;
  a.fleet.drivers[0].name='Updated in Fleet';
  assert.equal(reasons(a),'server_read_parity_ready');
  a.fleet.drivers[0].status='inaktiv';
  assert.equal(reasons(a),'ineligible_fleet_master');
});
test('booked driver and car must exist and be eligible according to Fleet',()=>{
  const a=params();
  a.vehicleId='NOT-IN-FLEET';
  assert.equal(reasons(a),'booking_master_not_in_original_fleet');
  a.vehicleId='ABC123';
  a.driverId='UNKNOWN';
  assert.equal(reasons(a),'booking_master_not_in_original_fleet');
  a.driverId='DA0001';
  a.fleet.vehicles[0].status='szerviz';
  a.depotVehicle.status='Szerviz';
  assert.equal(reasons(a),'ineligible_fleet_master');
  a.fleet=params().fleet;
  a.depotVehicle=params().depotVehicle;
  a.fleet.drivers[0].status='inaktiv';
  a.depotDriver.active=false;
  assert.equal(reasons(a),'ineligible_fleet_master');
});
test('missing or duplicate IDs and partial Fleet data are never valid',()=>{
  const a=params(); delete a.fleet.fuelCards;
  assert.equal(reasons(a),'invalid_full_fleet_snapshot');
  const b=params(); b.fleet.drivers.push({...b.fleet.drivers[0],id:'other'});
  assert.equal(reasons(b),'invalid_canonical_master_projection');
  const c=params(); c.depotDriver=null; c.depotVehicle=null;
  assert.equal(reasons(c),'server_read_parity_ready');
  c.fleet.drivers[0].status='inaktiv';
  assert.equal(reasons(c),'ineligible_fleet_master');
});
test('rich history remains only in full Fleet, not in strict Depot docs',()=>{
  const a=params();
  a.fleet.vehicles[0].history[0].note='Rich historical detail edited';
  const p=assess(a);
  assert.equal(p.ready,true);
  assert.equal('history' in a.depotVehicle,false);
  assert.equal('insurance' in a.depotVehicle,false);
  assert.equal(a.fleet.contacts.length,1);
  assert.equal(a.fleet.fuelCards.length,1);
});
test('pure helper never touches Firebase, network or real data',()=>{
  const source=readFileSync(new URL('./canonical-booking-gate.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(source,/\b(?:setDoc|runTransaction|deleteDoc|fetch|writeBatch|SpreadsheetApp|firebase)\s*\(/);
});
