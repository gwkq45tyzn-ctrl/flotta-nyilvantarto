import assert from 'node:assert/strict';
import test from 'node:test';
import {assessFleetDepotOperationalReadiness as assess,MAX_PHASE1_DRIVER_ROWS}
  from './v1-operational-readiness.mjs';

const source=()=>({
  drivers:[
    {id:'synthetic-d1',daCode:'DA0001',status:'aktiv',kapacitas:70},
    {id:'synthetic-d2',daCode:'DA0002',status:'inaktiv'}
  ],
  vehicles:[{id:'synthetic-v1',rendszam:'ABC-123',status:'aktiv'}],
  fuelCards:[],contacts:[]
});
test('active capacity and current 30-DA Rules window pass local operational preflight only',()=>{
  const r=assess(source());
  assert.equal(r.ready,true);
  assert.equal(r.counts.activeDrivers,1);
  assert.equal(r.authorizedForImport,false);
  assert.equal(r.ownerApprovalVerified,false);
  assert.deepEqual(r.reasons,[]);
});
test('missing active capacity cannot be silently defaulted to 70 or 80',()=>{
  const s=source();delete s.drivers[0].kapacitas;
  const r=assess(s);
  assert.equal(r.ready,false);
  assert.deepEqual(r.reasons,['ACTIVE_DRIVER_CAPACITY_UNSET_OR_INVALID']);
  assert.equal(r.counts.activeWithoutCapacity,1);
  assert.equal(JSON.stringify(r).includes('DA0001'),false);
  assert.equal(JSON.stringify(r).includes('synthetic-d1'),false);
});
test('invalid capacities or non-numeric strings fail closed',()=>{
  for(const bad of [0,-1,10001,70.5,'70',null,undefined,NaN]){
    const s=source();s.drivers[0].kapacitas=bad;
    assert.equal(assess(s).ready,false,'Invalid capacity '+String(bad));
  }
});
test('uncertain and inactive drivers cannot be booked by misclassification',()=>{
  const s=source();s.drivers[0].status='ismeretlen';
  const r=assess(s);
  assert.equal(r.ready,false);
  assert.ok(r.reasons.includes('NO_ACTIVE_DRIVERS'));
  assert.ok(r.warnings.includes('DRIVER_STATUS_NEEDS_OWNER_REVIEW'));
  assert.equal(r.counts.uncertainDriverStatuses,1);
});
test('31 or more rows fail for the actual current Rules window even if only one is active',()=>{
  const s=source();
  while(s.drivers.length<=MAX_PHASE1_DRIVER_ROWS){
    s.drivers.push({id:'synthetic-'+s.drivers.length,daCode:'DA'+s.drivers.length,
      status:'inaktiv'});
  }
  assert.equal(s.drivers.length,31);
  assert.equal(assess(s).ready,false);
  assert.ok(assess(s).reasons.includes('PHASE1_RULES_DRIVER_LIMIT_EXCEEDED'));
  s.drivers.length=MAX_PHASE1_DRIVER_ROWS;
  assert.equal(s.drivers.length,30);
  assert.equal(assess(s).ready,true);
  assert.equal(assess(s).counts.drivers,30);
  assert.equal(assess(s).authorizedForImport,false);
});
test('no operationally usable vehicles or missing source arrays blocks readiness',()=>{
  const s=source();s.vehicles[0].status='szerviz';
  assert.ok(assess(s).reasons.includes('NO_ACTIVE_VEHICLES'));
  assert.ok(assess({drivers:[]}).reasons.includes('INVALID_SOURCE_ARRAYS'));
  assert.equal(assess(null).authorizedForImport,false);
});
