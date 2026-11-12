import test from 'node:test';
import assert from 'node:assert/strict';
import {createServerImporter} from './v1-server-importer-checkpoint.mjs';
import {sha256,simulateBackup} from './v1-migration-dryrun.mjs';
const clean=()=>({
  drivers:[
    {id:'d1',daCode:'DA0001',name:'Synthetic',kapacitas:80,status:'aktiv',
      history:[{details:{nested:'á'}}]},
    {id:'d2',daCode:'DA0002',kapacitas:40,status:'aktiv',history:[]}
  ],
  vehicles:[{id:'v1',rendszam:'ABC-123',status:'aktiv',history:[{e:'service'}]}],
  fuelCards:[{id:'card',history:[]}],contacts:[{id:'contact',extra:{keep:true}}]
});
const newImporter=(raw=clean(),opts={})=>
  createServerImporter({trustedPinnedSha:sha256(raw),expectedRevision:1,...opts});
const begin=async(raw=clean(),opts={})=>{
  const i=newImporter(raw,opts);
  const result=await i.begin(raw,simulateBackup(raw));
  return {i,result};
};
function denied(r){
  assert.equal(r.ok,false);
  assert.equal(r.sealed,false);
  assert.equal(r.authorizedForImport,false);
  assert.equal(r.persistedKeyedRecordsVerified,false);
}
test('poisoned normalized duplicate DA and license plates refuse BEFORE checkpoint',async()=>{
  const dupDA=clean();dupDA.drivers[1].daCode='da0001';
  const dupPlate=clean();dupPlate.vehicles.push({
    id:'v2',rendszam:'abc 123',history:[],status:'aktiv'
  });
  for(const raw of [dupDA,dupPlate]){
    const i=newImporter(raw);
    const backup={type:'v1-full-rich-backup',version:2,
      snapshot:raw,sourceSha256:sha256(raw),imported:false,
      counts:{drivers:raw.drivers.length,vehicles:raw.vehicles.length,
        fuelCards:raw.fuelCards.length,contacts:raw.contacts.length}};
    const result=await i.begin(raw,backup);
    denied(result);
    assert.equal(i.getCheckpoint(),null);
    denied(await i.applyBatch(['drivers/DA0001']));
  }
});
test('valid preflight and deterministic batched plan never claims persisted data',async()=>{
  const {i,result}=await begin();
  assert.equal(result.ok,true);
  assert.equal(result.checkpoint.totalPlanned,3);
  assert.equal(result.checkpoint.plannedDigest,sha256([
    'drivers/DA0001','drivers/DA0002','vehicles/ABC123']));
  assert.deepEqual(i.getNextBatch(),[
    'drivers/DA0001','drivers/DA0002','vehicles/ABC123']);
  assert.deepEqual(i.getNextBatch(1),['drivers/DA0001']);
  const first=await i.applyBatch(['drivers/DA0001']);
  assert.equal(first.ok,true);
  assert.equal(first.plannedCount,1);
  assert.equal(first.persistedKeyedRecordsVerified,false);
  const second=await i.applyBatch(i.getNextBatch());
  assert.equal(second.ok,true);
  assert.equal(second.isPlanComplete,true);
  assert.equal(i.getNextBatch().length,0);
  denied(await i.seal());
  assert.equal(i.getCheckpoint().sealed,false);
});
test('unknown, duplicate, out-of-order, repeated, nonstring and too-large batch fail closed without any progress',async()=>{
  const {i}=await begin();
  const invalid=[
    undefined,null,{},[],[3],['drivers/Evil'],
    ['drivers/DA0002'],['drivers/DA0001','drivers/DA0001'],
    Array.from({length:49},()=> 'drivers/DA0001'),
    ['drivers/DA0001','vehicles/ABC123'],['vehicles/ABC123']
  ];
  for(const ids of invalid){
    denied(await i.applyBatch(ids));
    assert.equal(i.getCheckpoint().plannedIds.length,0);
  }
  assert.equal((await i.applyBatch(['drivers/DA0001'])).ok,true);
  denied(await i.applyBatch(['drivers/DA0001']));
  assert.deepEqual(i.getCheckpoint().plannedIds,['drivers/DA0001']);
  denied(await i.applyBatch(['drivers/DA0001','drivers/DA0002']));
  assert.equal(i.getCheckpoint().plannedIds.length,1);
});
test('getCheckpoint/getNextBatch returns copies, cannot mutate private plan',async()=>{
  const {i}=await begin();
  const checkpoint=i.getCheckpoint();
  checkpoint.sourceSha256='f'.repeat(64);
  checkpoint.plannedIds.push('drivers/ATTACKER');
  checkpoint.plannedDigest='a'.repeat(64);
  const next=i.getNextBatch();
  next[0]='vehicles/ATTACKER';
  assert.equal(i.getCheckpoint().plannedIds.length,0);
  assert.deepEqual(i.getNextBatch(),[
    'drivers/DA0001','drivers/DA0002','vehicles/ABC123']);
  denied(await i.applyBatch(['drivers/ATTACKER']));
  denied(await i.seal());
});
test('same importer cannot restart, rewind, forge a new approval or change source after begin',async()=>{
  const raw=clean(),{i}=await begin(raw);
  const changed=structuredClone(raw);changed.drivers[0].kapacitas=999;
  denied(await i.begin(changed,simulateBackup(raw)));
  assert.equal(i.getCheckpoint().plannedIds.length,0);
  assert.equal((await i.applyBatch(['drivers/DA0001'])).ok,true);
  denied(await i.begin(raw,simulateBackup(raw)));
  assert.equal(i.getCheckpoint().plannedIds.length,1);
  denied(i.resume(i.getCheckpoint()));
  assert.equal(i.getCheckpoint().durableCheckpointVerified,false);
  denied(await i.seal({iamApproved:true}));
});
test('missing, mismatching backup/source pin never opens a journal',async()=>{
  const raw=clean(),i=newImporter(raw);
  denied(await i.begin(raw,null));
  assert.equal(i.getCheckpoint(),null);
  const altered=structuredClone(raw);altered.contacts[0].extra.keep=false;
  denied(await i.begin(altered,simulateBackup(raw)));
  assert.equal(i.getCheckpoint(),null);
  // A failed attempt can be retried with the CORRECT source.
  assert.equal((await i.begin(raw,simulateBackup(raw))).ok,true);
});
test('concurrent begin attempt refused, no reset or double-init',async()=>{
  const raw=clean(),backup=simulateBackup(raw),i=newImporter(raw);
  const a=i.begin(raw,backup);
  const b=i.begin(raw,backup);
  const [one,two]=await Promise.all([a,b]);
  assert.equal(one.ok,true);
  denied(two);
  assert.equal(i.getCheckpoint().totalPlanned,3);
});
test('untrusted per-call pin/revision overrides denied and seal cannot become enabled',async()=>{
  const raw=clean(),i=newImporter(raw);
  const attacked=await i.begin(raw,{
    ...simulateBackup(raw),sourceSha256:'a'.repeat(64)
  });
  denied(attacked);
  assert.equal(i.getCheckpoint(),null);
  const ok=await i.begin(raw,simulateBackup(raw));
  assert.equal(ok.ok,true);
  denied(await i.seal({productionIamVerified:true}));
  assert.equal(i.getCheckpoint().integrityHashAuthenticated,false);
  assert.equal(typeof i.persist,'undefined');
  assert.equal(typeof i.writeToFirestore,'undefined');
});
test('empty valid Fleet source has zero plans and cannot claim seal',async()=>{
  const raw={drivers:[],vehicles:[],fuelCards:[],contacts:[]};
  const {i,result}=await begin(raw);
  assert.equal(result.ok,true);
  assert.equal(i.getCheckpoint().totalPlanned,0);
  denied(await i.applyBatch([]));
  denied(await i.seal());
});
