import test from 'node:test';
import assert from 'node:assert/strict';
import {simulateBackup,sha256,buildPlan} from './v1-migration-dryrun.mjs';
import {verifyPinnedImportSource} from './v1-pinned-backup-trust.mjs';
const source=()=>({
  drivers:[
    {id:'d1',daCode:'DA-0001',kapacitas:80,status:'aktiv',history:[{e:'hire',meta:{x:1}}]},
    {id:'d2',daCode:'DA-0002',kapacitas:50,status:'aktiv',history:[]}
  ],
  vehicles:[
    {id:'v1',rendszam:'ABC-123',status:'aktiv',history:[{event:'service',note:'á'}]},
    {id:'v2',rendszam:'DEF-456',status:'aktiv',history:[]}
  ],
  fuelCards:[{id:'f1',extra:{x:true}}],
  contacts:[{id:'c1',future:{history:[{e:'test'}]}}],
  extension:{keep:'untouched'}
});
const validate=(raw,overrides={})=>verifyPinnedImportSource({
  backup:simulateBackup(raw),trustedPinnedSha:sha256(raw),
  expectedRevision:1,...overrides
});
test('valid FULL rich source + genuine normalized identity projection accepted OFFLINE ONLY',()=>{
  const raw=source(),res=validate(raw);
  assert.equal(res.ok,true,JSON.stringify(res));
  assert.equal(res.plan.drivers[0].data.sourceIndex,0);
  assert.equal(res.plan.drivers[1].data.sourceIndex,1);
  assert.deepEqual(res.plan.drivers[0].data.history,raw.drivers[0].history);
  assert.deepEqual(res.plan.vehicles[0].data.history,raw.vehicles[0].history);
  assert.equal(res.authorizedForImport,false);
  assert.equal(res.trustedExternalProvenanceVerified,false);
  assert.equal(res.sealed,false);
  assert.equal(res.firestoreAdvisory.firestoreEncodedSizeVerified,false);
});
test('digest supplied by backup cannot replace independently pinned digest',()=>{
  const raw=source(),b=simulateBackup(raw);
  b.snapshot.contacts[0].future.history[0].e='FORGED';
  b.sourceSha256=sha256(b.snapshot);
  const result=verifyPinnedImportSource({
    backup:b,trustedPinnedSha:sha256(raw),expectedRevision:1
  });
  assert.equal(result.ok,false);
  assert.equal(result.reason,'UNTRUSTED_BACKUP_DIGEST');
});
test('preserved but forged SHA cannot pass independent pin check',()=>{
  const raw=source(),b=simulateBackup(raw);
  b.snapshot.drivers[0].history=[];
  const res=verifyPinnedImportSource({backup:b,trustedPinnedSha:sha256(raw),expectedRevision:1});
  assert.equal(res.ok,false);
  assert.equal(res.reason,'BACKUP_CONTENT_TAMPER');
});
test('preexisting sourceIndex exactly zero or mismatched denied BEFORE buildPlan',()=>{
  for(const kind of ['drivers','vehicles']){
    const raw=source();raw[kind][0].sourceIndex=0;
    assert.throws(()=>simulateBackup(raw),/sourceIndex/);
  }
});
test('poisoned normalized duplicate DA/plate cannot create an authorized plan',()=>{
  const duplicateDA=source();duplicateDA.drivers[1].daCode='da-0001';
  const duplicatePlate=source();duplicatePlate.vehicles[1].rendszam='abc 123';
  assert.throws(()=>simulateBackup(duplicateDA),/Duplicate DA/);
  assert.throws(()=>simulateBackup(duplicatePlate),/Duplicate plate/);
});
test('backup envelope, source revision and inherited privileged seals fail closed',()=>{
  const raw=source(),b=simulateBackup(raw),pin=sha256(raw);
  const run=(backup,expectedRevision=1)=>
    verifyPinnedImportSource({backup,trustedPinnedSha:pin,expectedRevision});
  assert.equal(run({...b,imported:true}).reason,'BACKUP_NOT_PREIMPORT');
  assert.equal(run({...b,version:0}).reason,'INVALID_BACKUP_ENVELOPE');
  assert.equal(run(b,0).reason,'TRUST_PIN_OR_REVISION_MISSING');
  raw.revision=3;
  const b2=simulateBackup(raw);
  const v=verifyPinnedImportSource({backup:b2,trustedPinnedSha:sha256(raw),expectedRevision:1});
  assert.equal(v.reason,'SOURCE_REVISION_DRIFT');
  raw.migrationSourceSha256='a'.repeat(64);
  const b3=simulateBackup(raw);
  assert.equal(verifyPinnedImportSource({backup:b3,trustedPinnedSha:sha256(raw),expectedRevision:3}).reason,
    'SOURCE_ALREADY_HAS_PRIVILEGED_SEAL_FIELDS');
});
test('extra / missing / mutated keyed documents block full parity at source seal checkpoint',()=>{
  const raw=source(),b=simulateBackup(raw),p=buildPlan(raw);
  const keyed={
    drivers:Object.fromEntries(p.drivers.map(x=>[x.id,structuredClone(x.data)])),
    vehicles:Object.fromEntries(p.vehicles.map(x=>[x.id,structuredClone(x.data)]))
  };
  assert.equal(validate(raw,{observedKeyed:keyed}).ok,true);
  keyed.drivers['DA-0001'].history[0].meta.x=2;
  assert.equal(validate(raw,{observedKeyed:keyed}).reason,'KEYED_PARITY_DENIED');
  keyed.drivers['DA-0001'].history[0].meta.x=1;
  keyed.vehicles.EXTRA123={rendszam:'EXTRA-123',sourceIndex:1};
  assert.equal(validate(raw,{observedKeyed:keyed}).reason,'KEYED_PARITY_DENIED');
});
test('oversized invalid source and unsupported nested values never obtain authorization',()=>{
  const raw=source();raw.extension.bad=undefined;
  assert.throws(()=>simulateBackup(raw),/Non-JSON value in source: undefined/);
});
