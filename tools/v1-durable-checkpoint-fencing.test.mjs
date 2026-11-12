import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createFencedImporter} from './v1-durable-checkpoint-fencing.mjs';
import {sha256,simulateBackup} from './v1-migration-dryrun.mjs';

const clean=()=>({
  drivers:[{id:'d1',daCode:'DA0001',kapacitas:80,status:'aktiv',
    history:[{kind:'hire',nested:{utf8:'á'}}]}],
  vehicles:[{id:'v1',rendszam:'ABC-123',status:'aktiv',history:[]}],
  fuelCards:[],contacts:[]
});
const make=(raw=clean())=>createFencedImporter({trustedPinnedSha:sha256(raw)});
const valid=r=>{
  assert.equal(r.ok,true);
  assert.equal(r.sealed,false);
  assert.equal(r.authorizedForImport,false);
  assert.equal(r.durableCheckpointVerified,false);
  assert.equal(r.distributedFencingVerified,false);
};
const deny=(r,why)=>{
  assert.equal(r.ok,false);
  assert.equal(r.sealed,false);
  assert.equal(r.authorizedForImport,false);
  if(why)assert.match(r.reason,why);
};
test('different importer instances conflict over same Fleet resource in one Node process',async()=>{
  const raw=clean(),backup=simulateBackup(raw),a=make(raw),b=make(raw);
  valid(await a.acquire(raw,backup));
  deny(await b.acquire(raw,backup),/PARALLEL_IMPORT_DENIED/);
  assert.equal(b.isLocked(),false);
  deny(await a.acquire(raw,backup),/PARALLEL_IMPORT_DENIED/);
  assert.equal((await a.apply(['drivers/DA0001'])).ok,true);
  valid(await a.release());
  deny(await a.release(),/NO_OWNED_LEASE/);
  valid(await b.acquire(raw,backup));
  deny(await a.acquire(raw,backup),/REUSED_IMPORTER_INSTANCE_DENIED/);
  valid(await b.release());
});
test('two Promise.all acquires have exactly one winner and cannot bypass pending begin',async()=>{
  const raw=clean(),backup=simulateBackup(raw),a=make(raw),b=make(raw);
  const [ar,br]=await Promise.all([a.acquire(raw,backup),b.acquire(raw,backup)]);
  assert.equal([ar,br].filter(x=>x.ok).length,1);
  assert.equal([ar,br].filter(x=>!x.ok).length,1);
  deny(ar.ok?br:ar,/PARALLEL_IMPORT_DENIED/);
  const owner=ar.ok?a:b;
  valid(await owner.release());
});
test('poisoned normalized DA cannot acquire and does not poison shared lock',async()=>{
  const raw=clean(),poisoned=structuredClone(raw);
  poisoned.drivers.push({id:'d2',daCode:'da0001',kapacitas:500,status:'aktiv',history:[]});
  const malicious=make(poisoned);
  const forgedBackup={type:'v1-full-rich-backup',version:2,
    sourceSha256:sha256(poisoned),snapshot:poisoned,imported:false,
    counts:{drivers:2,vehicles:1,fuelCards:0,contacts:0}};
  deny(await malicious.acquire(poisoned,forgedBackup),/SOURCE_ATTESTATION_DENIED/);
  assert.equal(malicious.isLocked(),false);
  const a=make(raw);
  valid(await a.acquire(raw,simulateBackup(raw)));
  valid(await a.release());
});
test('different source hash still shares one canonical Fleet process resource',async()=>{
  const raw=clean(),changed=clean();changed.drivers[0].kapacitas=41;
  const a=make(raw),b=make(changed);
  valid(await a.acquire(raw,simulateBackup(raw)));
  deny(await b.acquire(changed,simulateBackup(changed)),/PARALLEL_IMPORT_DENIED/);
  valid(await a.release());
});
test('plan-only apply validates original IDs, release blocks stale owner, never writes/seals',async()=>{
  const raw=clean(),a=make(raw);
  deny(await a.apply(['drivers/DA0001']),/NO_ACTIVE_PROCESS_LEASE/);
  valid(await a.acquire(raw,simulateBackup(raw)));
  const cp=a.getCheckpoint();
  cp.plannedIds.push('drivers/MALICIOUS');
  assert.deepEqual(a.getCheckpoint().plannedIds,[]);
  deny(await a.apply(['drivers/MALICIOUS']),/UNKNOWN_REPLAYED_OR_OUT_OF_ORDER_BATCH_ID/);
  const good=await a.apply(['drivers/DA0001']);
  assert.equal(good.ok,true);
  assert.equal(good.persistedKeyedRecordsVerified,false);
  deny(await a.seal(),/NO_PRODUCTION_IAM_PROOF/);
  valid(await a.release());
  deny(await a.apply(['vehicles/ABC123']),/NO_ACTIVE_PROCESS_LEASE/);
  assert.equal(a.getCheckpoint(),null);
  deny(await a.seal(),/NO_PRODUCTION_IAM_PROOF/);
});
test('THIS process lease does NOT fence a separate Node process: explicit distributed NO-GO',async()=>{
  const raw=clean(),parent=make(raw);
  valid(await parent.acquire(raw,simulateBackup(raw)));
  try{
    const mod=new URL('./v1-durable-checkpoint-fencing.mjs',import.meta.url).href;
    const migr=new URL('./v1-migration-dryrun.mjs',import.meta.url).href;
    const child=`
      import {createFencedImporter} from ${JSON.stringify(mod)};
      import {sha256,simulateBackup} from ${JSON.stringify(migr)};
      const s=${JSON.stringify(raw)};
      const x=createFencedImporter({trustedPinnedSha:sha256(s)});
      const r=await x.acquire(s,simulateBackup(s));
      if(!r.ok)process.exitCode=1;else await x.release();
    `;
    const output=execFileSync(process.execPath,['--input-type=module','-e',child],
      {timeout:12000,encoding:'utf8'});
    assert.equal(output,'');
    assert.equal(parent.isLocked(),true);
    // This successful second-process acquisition is an explicit LIMITATION,
    // not evidence the production distributed lock is safe.
  }finally{
    valid(await parent.release());
  }
});
