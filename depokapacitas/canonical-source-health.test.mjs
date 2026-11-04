import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {planSharedMigration} from '../features/shared-master-adapter.mjs';
import {assessCanonicalMasterDisplay as assess} from './canonical-source-health.mjs';

const SHA='f'.repeat(64),uid='synthetic-user',now=2_000_000;
const source=()=>({
  revision:5,migrationSourceSha256:SHA,
  vehicles:[{id:'internal1',rendszam:'ABC-123',gyartmany:'Ford',modell:'Transit',
    status:'aktiv',km:25000,insurance:{policy:'SYN'},history:[{note:'PRIVATE HISTORY'}]}],
  drivers:[{id:'internal2',daCode:'DA0001',name:'Synthetic Courier',agency:'VENDOR',
    status:'aktiv',kapacitas:80,phone:'555-000',history:[{secret:'PRIVATE'}]}],
  fuelCards:[{id:'PRIVATE FUEL',pin:'SYNTHETIC'}],
  contacts:[{name:'PRIVATE CONTACT'}]
});
const meta=()=>Object.fromEntries(
 ['drivers','vehicles','flottaSharedState','flottaMigrationApproval']
  .map(k=>[k,{loaded:true,error:false,fromCache:false,pending:false,serverAt:now-1000}])
);
function good(){
 const fleet=source(),p=planSharedMigration(fleet);
 assert.equal(p.ready,true);
 return {
  fleet,approval:{status:'approved',approvedUid:uid,sourceSha256:SHA},
  uid,sourceMeta:meta(),now,online:true,
  driverMirrors:p.writes.drivers.map(x=>({id:x.id,...x.data})),
  vehicleMirrors:p.writes.vehicles.map(x=>({id:x.id,...x.data}))
 };
}
const check=(partial={})=>assess({...good(),...partial});
test('only complete original Fleet is operational source; no rich history sidecars leak',()=>{
 const r=check();
 assert.equal(r.trusted,true);
 assert.equal(r.status,'ready');
 assert.equal(r.revision,5);
 assert.deepEqual(r.drivers,[{id:'DA0001',name:'Synthetic Courier',
   daCode:'DA0001',vendor:'VENDOR',capacity:80,active:true}]);
 assert.deepEqual(r.vehicles,[{id:'ABC123',plate:'ABC123',model:'Ford Transit',status:'Elérhető'}]);
 const string=JSON.stringify(r);
 for(const secret of ['PRIVATE HISTORY','PRIVATE FUEL','PRIVATE CONTACT','555-000','insurance','km']){
  assert.equal(string.includes(secret),false,secret+' must not appear in canonical UI');
 }
 assert.equal(r.liveVerified,false,'Local preflight cannot claim live cloud GO');
});
test('pre-migration, wrong UID or untrusted policy cannot list masters',()=>{
 for(const partial of [
  {approval:null},
  {approval:{status:'pending',approvedUid:uid,sourceSha256:SHA}},
  {approval:{status:'approved',approvedUid:'someone else',sourceSha256:SHA}},
  {approval:{status:'approved',approvedUid:uid,sourceSha256:'BAD'}},
  {uid:''}
 ]){
  const r=check(partial);
  assert.equal(r.trusted,false);
  assert.deepEqual(r.drivers,[]);
  assert.deepEqual(r.vehicles,[]);
 }
});
test('original Fleet requires full import source SHA binding and valid revision',()=>{
 const f=source();
 delete f.migrationSourceSha256;
 assert.equal(check({fleet:f}).reason,'original_fleet_source_not_attested');
 f.migrationSourceSha256='b'.repeat(64);
 assert.equal(check({fleet:f}).trusted,false);
 f.migrationSourceSha256=SHA;f.revision=0;
 assert.equal(check({fleet:f}).trusted,false);
});
test('offline, cached, pending, stale, missing and future server confirmation all block',()=>{
 assert.equal(check({online:false}).reason,'offline');
 for(const key of Object.keys(meta())){
  for(const patch of [
   {loaded:false},{fromCache:true},{pending:true},{error:true},
   {serverAt:now-20*60_000},{serverAt:now+5000},{serverAt:null}
  ]){
   const state=meta();state[key]={...state[key],...patch};
   const r=check({sourceMeta:state});
   assert.equal(r.trusted,false,key+' '+JSON.stringify(patch));
   assert.equal(r.reason,'unconfirmed_or_stale_source_'+key);
  }
 }
});
test('extra or missing legacy Depot mirrors do not become the canonical operational source',()=>{
 const base=good(),expected=check();
 for(const partial of [
  {vehicleMirrors:[...base.vehicleMirrors,{id:'XYZ999',plate:'XYZ999',model:'extra',status:'Elérhető'}]},
  {driverMirrors:[]},{driverMirrors:undefined},{driverMirrors:null},
  {vehicleMirrors:null}
 ]){
  const result=check(partial);
  assert.equal(result.trusted,true,'Canonical Fleet remains the verified source');
  assert.deepEqual(result.vehicles,expected.vehicles);
  assert.deepEqual(result.drivers,expected.drivers);
  assert.equal(result.vehicles.some(v=>v.id==='XYZ999'),false,'Forged mirror must not leak into lists');
 }
});
test('out-of-band legacy mirror changes cannot override Fleet master fields',()=>{
 const b=good();
 b.vehicleMirrors[0].status='Szerviz';
 let r=check({vehicleMirrors:b.vehicleMirrors});
 assert.equal(r.trusted,true);
 assert.equal(r.vehicles[0].status,'Elérhető');
 const c=good();c.driverMirrors[0].name='Out of date';
 r=check({driverMirrors:c.driverMirrors});
 assert.equal(r.trusted,true);
 assert.equal(r.drivers[0].name,'Synthetic Courier');
});
test('original Fleet changes update canonical lists without requiring legacy mirror writes',()=>{
 const b=source();b.vehicles[0].status='szerviz';
 let r=check({fleet:b});
 assert.equal(r.trusted,true);
 assert.equal(r.vehicles[0].status,'Szerviz');
 assert.equal(r.vehicles.filter(v=>v.status==='Elérhető').length,0);
 b.vehicles[0].status='aktiv';b.drivers[0].name='Changed in Fleet';
 r=check({fleet:b});
 assert.equal(r.trusted,true);
 assert.equal(r.drivers[0].name,'Changed in Fleet');
});
test('original history-only changes do not alter strict projection',()=>{
 const b=source();b.vehicles[0].history[0].note='updated internally';
 b.fuelCards[0].pin='CHANGED SYNTHETIC';
 const r=check({fleet:b});
 assert.equal(r.trusted,true);
 assert.equal(r.vehicles.length,1);
});
test('duplicates and invalid source statuses block all lists',()=>{
 const b=source();
 b.vehicles.push({...b.vehicles[0],id:'other'});
 assert.equal(check({fleet:b}).trusted,false);
 const c=source();c.drivers[0].status='unknown';
 assert.equal(check({fleet:c}).trusted,false);
});
test('canonical UI source is pure and has no real data, IO or Firestore writes',()=>{
 const s=readFileSync(new URL('./canonical-source-health.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(s,/\b(?:fetch|setDoc|updateDoc|writeBatch|runTransaction|localStorage|SpreadsheetApp)\s*\(/);
});
