/**
 * #156 independent hostile synthetic keyed-live projection acceptance.
 * RED is expected until authoritative, complete, server-confirmed source
 * validation is implemented. Do not weaken assertions for a green CI.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {projectKeyedMasters,capacityFromKeyed} from './keyed-live-master.mjs';
const snap=(records,metadata={fromCache:false,hasPendingWrites:false})=>({
 docs:records.map(([id,data])=>({id,data:()=>data})),...(metadata?{metadata}:{})
});
const fleet=()=>({
 sealed:true,
 drivers:[{id:'d1',daCode:'DA0001'}],
 vehicles:[{id:'v1',rendszam:'ABC-123'}]
});
const drivers=()=>snap([['DA0001',{daCode:'DA0001',kapacitas:80,status:'aktiv',history:[{a:1}]}]]);
const vehicles=()=>snap([['ABC123',{rendszam:'ABC-123',status:'aktiv',history:[{a:2}]}]]);
test('positive control: fully confirmed original Fleet keyed sources yield capacity=80',()=>{
 const out=projectKeyedMasters(drivers(),vehicles(),fleet());
 assert.ok(out?.trusted);
 assert.equal(out.drivers[0].capacity,80);
 assert.equal(out.vehicles[0].status,'Elérhető');
});
test('P0: absent Firestore snapshot metadata must NEVER be treated as server-confirmed',()=>{
 const driver=snap([['DA0001',{daCode:'DA0001',kapacitas:80,status:'aktiv'}]],null);
 assert.equal(projectKeyedMasters(driver,vehicles(),fleet()),null);
});
test('P0: malformed additional keyed driver must block entire projection, not disappear via filter',()=>{
 const bad=snap([
  ['DA0001',{daCode:'DA0001',kapacitas:80,status:'aktiv'}],
  ['DA2222',{daCode:'DA9999',kapacitas:900,status:'aktiv'}]
 ]);
 assert.equal(projectKeyedMasters(bad,vehicles(),fleet()),null);
});
test('P0: authenticated unapproved additional keyed vehicle must not appear as available',()=>{
 const bad=snap([
  ['ABC123',{rendszam:'ABC-123',status:'aktiv'}],
  ['XYZ999',{rendszam:'XYZ-999',status:'aktiv'}]
 ]);
 assert.equal(projectKeyedMasters(drivers(),bad,fleet()),null);
});
test('P0: archived duplicate DA identities must be rejected, never silently collapsed by Set',()=>{
 const archive=fleet();
 archive.drivers.push({id:'d2',daCode:'da0001'});
 assert.equal(projectKeyedMasters(drivers(),vehicles(),archive),null);
});
test('P0: missing or nonnumeric source capacity must never yield a trusted master',()=>{
 const missing=snap([['DA0001',{daCode:'DA0001',status:'aktiv'}]]);
 assert.equal(projectKeyedMasters(missing,vehicles(),fleet()),null);
 const invalid=snap([['DA0001',{daCode:'DA0001',kapacitas:'not-a-number',status:'aktiv'}]]);
 assert.equal(projectKeyedMasters(invalid,vehicles(),fleet()),null);
});
test('negative controls: cache, pending, incomplete and service car cannot yield usable eligibility',()=>{
 const stale=drivers();
 stale.metadata.fromCache=true;
 assert.equal(projectKeyedMasters(stale,vehicles(),fleet()),null);
 const pending=vehicles();
 pending.metadata.hasPendingWrites=true;
 assert.equal(projectKeyedMasters(drivers(),pending,fleet()),null);
 assert.equal(projectKeyedMasters(drivers(),vehicles(),{...fleet(),sealed:false}),null);
 const service=snap([['ABC123',{rendszam:'ABC-123',status:'szerviz'}]]);
 const out=projectKeyedMasters(drivers(),service,fleet());
 assert.ok(out?.trusted);
 assert.equal(out.vehicles[0].status,'Szerviz');
});
