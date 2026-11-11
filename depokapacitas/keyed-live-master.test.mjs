import test from 'node:test';
import assert from 'node:assert/strict';
import { projectKeyedMasters, capacityFromKeyed } from './keyed-live-master.mjs';
const snap=(records,metadata={fromCache:false,hasPendingWrites:false})=>({
  docs:records.map(([id,data])=>({id,data:()=>data})),metadata
});
const fleet=()=>({sealed:true,drivers:[{daCode:'DA0001'}],vehicles:[{rendszam:'ABC-123'}]});
const drivers=()=>snap([['DA0001',{daCode:'DA0001',kapacitas:80,status:'aktiv'}]]);
const vehicles=()=>snap([['ABC123',{rendszam:'ABC-123',status:'aktiv'}]]);
test('positive: confirmed keyed sources yield capacity=80',()=>{
  const out=projectKeyedMasters(drivers(),vehicles(),fleet());
  assert.ok(out?.trusted);
  assert.equal(capacityFromKeyed(out,'DA0001'),80);
});
test('absent metadata blocks',()=>{
  assert.equal(projectKeyedMasters(snap([['DA0001',{daCode:'DA0001',kapacitas:80,status:'aktiv'}]],null),vehicles(),fleet()),null);
});
test('bad extra driver blocks',()=>{
  const bad=snap([['DA0001',{daCode:'DA0001',kapacitas:80,status:'aktiv'}],['DA2222',{daCode:'DA9999',kapacitas:900,status:'aktiv'}]]);
  assert.equal(projectKeyedMasters(bad,vehicles(),fleet()),null);
});
test('unapproved vehicle blocks',()=>{
  const bad=snap([['ABC123',{rendszam:'ABC-123',status:'aktiv'}],['XYZ999',{rendszam:'XYZ-999',status:'aktiv'}]]);
  assert.equal(projectKeyedMasters(drivers(),bad,fleet()),null);
});
test('archive duplicate blocks',()=>{
  const archive=fleet();
  archive.drivers.push({daCode:'da0001'});
  assert.equal(projectKeyedMasters(drivers(),vehicles(),archive),null);
});
test('missing capacity blocks',()=>{
  assert.equal(projectKeyedMasters(snap([['DA0001',{daCode:'DA0001',status:'aktiv'}]]),vehicles(),fleet()),null);
});
console.log('keyed master tests defined');
