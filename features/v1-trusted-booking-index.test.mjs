import test from 'node:test';
import assert from 'node:assert/strict';
import {deriveTrustedBookingIndexes} from './v1-trusted-booking-index.mjs';

const original=()=>({
  vehicles:[{rendszam:'ABC-123',status:'aktiv',history:[{note:'SYNTHETIC'}]},
    {rendszam:'XYZ 789',status:'szerviz'}],
  drivers:[{daCode:'DA0001',id:'internal1',name:'Test One',status:'aktiv',kapacitas:50},
    {daCode:'DA0002',id:'internal2',name:'Test Two',status:'aktiv',kapacitas:20}],
  fuelCards:[],contacts:[]
});
test('import-generated approval maps pin original indexes without losing rich Fleet',()=>{
  const snapshot=original(),before=JSON.stringify(snapshot);
  const {bookingDriverIndexes,bookingVehicleIndexes}=deriveTrustedBookingIndexes(snapshot);
  assert.deepEqual(bookingDriverIndexes,{DA0001:0,DA0002:1});
  assert.deepEqual(bookingVehicleIndexes,{ABC123:0,XYZ789:1});
  assert.equal(JSON.stringify(snapshot),before,'no mutating original rich records');
});
test('duplicate DA codes differing in capacity fail the trusted import',()=>{
  const x=original();x.drivers[1].daCode='da0001';x.drivers[1].kapacitas=500;
  assert.throws(()=>deriveTrustedBookingIndexes(x),/IDENTITY_IMPORT_BLOCKED.*duplicate normalized DA code/);
});
test('duplicate normalized plates fail the trusted import',()=>{
  const x=original();x.vehicles[1].rendszam='abc 123';
  assert.throws(()=>deriveTrustedBookingIndexes(x),/IDENTITY_IMPORT_BLOCKED.*duplicate normalized plate/);
});
test('Unicode case alias and NBSP raw plates fail rather than normalize to ASCII identity',()=>{
  for(const raw of ['ABCı23','ABC\u00a0123','ABC–123','TEſT0001']){
    const x=original();x.vehicles[0].rendszam=raw;
    assert.throws(()=>deriveTrustedBookingIndexes(x),/IDENTITY_IMPORT_BLOCKED/,raw);
  }
});
test('missing original Fleet arrays and invalid capacity fail before map approval',()=>{
  const x=original();delete x.contacts;
  assert.throws(()=>deriveTrustedBookingIndexes(x),/Incomplete original Flotta snapshot/);
  const y=original();delete y.drivers[0].kapacitas;y.drivers[0].capacity='bad';
  assert.throws(()=>deriveTrustedBookingIndexes(y),/IDENTITY_IMPORT_BLOCKED/);
});
test('reordered original Fleet produces changed pinned map and needs a new trusted approval',()=>{
  const x=original(),before=deriveTrustedBookingIndexes(x);
  x.drivers.reverse();
  const after=deriveTrustedBookingIndexes(x);
  assert.equal(before.bookingDriverIndexes.DA0001,0);
  assert.equal(after.bookingDriverIndexes.DA0001,1);
});
console.log('offline trusted approval index derivation QA; no privileged write or deploy');
