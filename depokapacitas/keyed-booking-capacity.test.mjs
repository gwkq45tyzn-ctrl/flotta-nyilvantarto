import test from 'node:test';
import assert from 'node:assert/strict';
import {projectLiveBookingCapacity as project} from './keyed-booking-capacity.mjs';

const today='2026-11-11';
test('an existing next-day 80-parcel booking now counts as 70 after verified Fleet change',()=>{
  const raw=[{id:'old-booking',date:'2026-11-12',driverId:'DA0001',vehicleId:'ABC123',
    district:'IX',capacity:80,status:'confirmed'}];
  const copy=structuredClone(raw);
  const rows=project(raw,[{id:'DA0001',capacity:70,active:true}],today);
  assert.equal(rows[0].capacity,70);
  assert.equal(raw[0].capacity,80,'do not overwrite the persisted booking snapshot');
  assert.deepEqual(raw,copy);
});
test('historic confirmed bookings preserve their recorded capacity',()=>{
  const raw=[{id:'previous',date:'2026-11-10',driverId:'DA0001',capacity:80,status:'confirmed'}];
  assert.equal(project(raw,[{id:'DA0001',capacity:70}],today)[0].capacity,80);
});
test('missing current driver or invalid recorded capacity must fail closed, not reuse stale 80',()=>{
  const b={date:'2026-11-12',driverId:'DA0001',capacity:80};
  assert.equal(project([b],[],today)[0].capacity,-1);
  assert.equal(project([{...b,capacity:-1}],[{id:'DA0001',capacity:70}],today)[0].capacity,-1);
  assert.equal(project([b],[{id:'DA0001',capacity:0}],today)[0].capacity,0);
});
test('duplicate, impossible or unverifiable live driver capacities reject all calculations',()=>{
  const b={date:'2026-11-12',driverId:'DA0001',capacity:80};
  for(const drivers of [
    [{id:'DA0001',capacity:'70'}],
    [{id:'DA0001',capacity:-1}],
    [{id:'DA0001',capacity:10001}],
    [{id:'DA0001',capacity:70},{id:'DA0001',capacity:70}]
  ])assert.throws(()=>project([b],drivers,today));
  assert.throws(()=>project([b],null,today));
});
