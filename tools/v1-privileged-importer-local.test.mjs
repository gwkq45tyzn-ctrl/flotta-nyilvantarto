import test from 'node:test';
import assert from 'node:assert/strict';
import {createLocalImporter} from './v1-privileged-importer-local.mjs';
import {buildPlan,sha256,simulateBackup} from './v1-migration-dryrun.mjs';

const clean=()=>({
  drivers:[
    {id:'d1',daCode:'DA0001',name:'A',kapacitas:80,status:'aktiv',
      history:[{kind:'hire',nested:{agency:'NO_REAL_AGENCY'}}]},
    {id:'d2',daCode:'DA0002',name:'B',kapacitas:60,status:'aktiv',history:[]}
  ],
  vehicles:[{id:'v1',rendszam:'ABC-123',status:'aktiv',history:[{kind:'service',note:'á'}]}],
  fuelCards:[{id:'f1',history:[{date:'2099-01-01'}]}],
  contacts:[{id:'c1',extra:{preserve:true}}],
  richRoot:{future:'keep'}
});
const attempt=async(raw=clean(),other={},opts={})=>{
  const pin=sha256(raw),backup=simulateBackup(raw);
  const importer=createLocalImporter({trustedPinnedSha:pin,
    expectedRevision:1,...other});
  return importer.importSource(raw,{backup,...opts});
};
const denied=r=>{
  assert.equal(r.ok,false);
  assert.equal(r.sealed,false);
  assert.equal(r.authorizedForImport,false);
  assert.equal(r.trustedExternalProvenanceVerified,false);
  assert.equal(r.productionIamVerified,false);
};
const valid=r=>{
  assert.equal(r.ok,true);
  assert.equal(r.sealed,false);
  assert.equal(r.authorizedForImport,false);
  assert.equal(r.trustedExternalProvenanceVerified,false);
  assert.equal(r.productionIamVerified,false);
  assert.equal(r.firestoreEncodedSizeVerified,false);
  assert.equal(r.writesAttempted,0);
};

test('valid clean source and independently pinned full-rich backup DRY RUN ALLOW without privileged write',async()=>{
  const raw=clean(),importer=createLocalImporter({
    trustedPinnedSha:sha256(raw),expectedRevision:1
  });
  const result=await importer.importSource(raw,{backup:simulateBackup(raw)});
  valid(result);
  assert.match(result.reason,/DRY_RUN/);
  assert.equal(result.projectedDocumentCount,3);
  assert.equal(result.keyedParityVerified,false);
  assert.equal(importer.writes.length,0);
  assert.equal(Object.isFrozen(importer.writes),true);
});

test('no externally pinned hash and no separate backup MUST DENY a clean source',async()=>{
  const raw=clean();
  denied(await createLocalImporter().importSource(raw,{backup:simulateBackup(raw)}));
  const importer=createLocalImporter({trustedPinnedSha:sha256(raw)});
  const result=await importer.importSource(raw);
  denied(result);
  assert.equal(result.reason,'INDEPENDENT_BACKUP_REQUIRED');
});

test('tampered source is denied against an independent pinned original digest',async()=>{
  const original=clean(),backup=simulateBackup(original),pin=sha256(original);
  const modified=structuredClone(original);
  modified.drivers[0].history[0].nested.agency='MALICIOUS';
  const result=await createLocalImporter({trustedPinnedSha:pin})
    .importSource(modified,{backup});
  denied(result);
  assert.equal(result.reason,'RAW_SOURCE_NOT_TRUSTED_PIN');
});

test('forged backup that rewrites its own hash never overrides trusted pin',async()=>{
  const original=clean(),backup=simulateBackup(original);
  backup.snapshot.vehicles[0].history=[];
  backup.sourceSha256=sha256(backup.snapshot);
  const r=await createLocalImporter({trustedPinnedSha:sha256(original)})
    .importSource(original,{backup});
  denied(r);
  assert.match(r.reason,/UNTRUSTED_BACKUP_DIGEST/);
});

test('normalized duplicate DA and vehicle plates denied before any seal',async()=>{
  const duplicatedDriver=clean();
  duplicatedDriver.drivers[1].daCode='da0001';
  const duplicatedPlate=clean();
  duplicatedPlate.vehicles.push({
    id:'v2',rendszam:'abc 123',status:'aktiv',history:[]
  });
  for(const raw of [duplicatedDriver,duplicatedPlate]){
    // A genuinely poisoned source cannot even obtain a valid pre-import
    // backup, so simulate what an attacker tried to pass directly.
    const backup={
      type:'v1-full-rich-backup',version:2,sourceSha256:sha256(raw),
      snapshot:raw,counts:{
        drivers:raw.drivers.length,vehicles:raw.vehicles.length,
        fuelCards:raw.fuelCards.length,contacts:raw.contacts.length
      },imported:false
    };
    const result=await createLocalImporter({trustedPinnedSha:sha256(raw)})
      .importSource(raw,{backup});
    denied(result);
    assert.match(result.reason,/SOURCE_PREFLIGHT_DENIED|BACKUP_CONTENT_TAMPER/);
  }
});

test('poisoned original sourceIndex zero DENIED, even before project index is built',async()=>{
  const raw=clean();
  raw.drivers[0].sourceIndex=0;
  const backup={
    type:'v1-full-rich-backup',version:2,sourceSha256:sha256(raw),
    snapshot:raw,counts:{drivers:2,vehicles:1,fuelCards:1,contacts:1},imported:false
  };
  const out=await createLocalImporter({trustedPinnedSha:sha256(raw)})
    .importSource(raw,{backup});
  denied(out);
  assert.match(out.reason,/BACKUP_CONTENT_TAMPER|SOURCE_PREFLIGHT_DENIED/);
});

test('rich projected keyed parity with actual original positions is explicit and strict',async()=>{
  const raw=clean(),p=buildPlan(raw);
  const keyed={
    drivers:Object.fromEntries(p.drivers.map(d=>[d.id,structuredClone(d.data)])),
    vehicles:Object.fromEntries(p.vehicles.map(v=>[v.id,structuredClone(v.data)]))
  };
  valid(await attempt(raw,{}, {observedKeyed:keyed}));
  keyed.drivers.DA0001.history=[];
  const altered=await attempt(raw,{}, {observedKeyed:keyed});
  denied(altered);
  assert.equal(altered.reason,'KEYED_PARITY_DENIED');
  delete keyed.drivers.DA0002;
  denied(await attempt(raw,{}, {observedKeyed:keyed}));
});

test('clean source cannot take non-dry-run path even if backup and pin are valid',async()=>{
  const r=await attempt(clean(),{dryRun:false});
  denied(r);
  assert.match(r.reason,/NO_PRODUCTION_IAM_PROOF/);
});

test('invalid non-JSON, wrong revision and invalid options never grant rights',async()=>{
  const raw=clean();
  const invalid=structuredClone(raw);invalid.richRoot.future=undefined;
  const i=createLocalImporter({trustedPinnedSha:sha256(raw)});
  denied(await i.importSource(invalid,{backup:simulateBackup(raw)}));
  denied(await i.importSource(raw,{backup:simulateBackup(raw),expectedRevision:0}));
  denied(await i.importSource(raw,[]));
});

test('per-call untrusted digest cannot override independently pinned expected SHA or revision',async()=>{
  const original=clean(),forged=structuredClone(original);
  forged.drivers[0].kapacitas=999;
  const importer=createLocalImporter({
    trustedPinnedSha:sha256(original),expectedRevision:1
  });
  const result=await importer.importSource(forged,{
    backup:simulateBackup(forged),
    trustedPinnedSha:sha256(forged),
    expectedRevision:999
  });
  denied(result);
  assert.equal(result.reason,'UNTRUSTED_PER_CALL_AUTHORITY_OVERRIDE');
  assert.equal(importer.trustedPinnedSha,undefined);
  assert.equal(importer.expectedRevision,undefined);
  importer.trustedPinnedSha=sha256(forged); // public property is NOT the private pin
  denied(await importer.importSource(forged,{backup:simulateBackup(forged)}));
});

test('the local preview never contains a Firestore write or seal capability',async()=>{
  const raw=clean(),obj=createLocalImporter({trustedPinnedSha:sha256(raw)});
  const res=await obj.importSource(raw,{backup:simulateBackup(raw)});
  valid(res);
  assert.equal(typeof obj.seal,'undefined');
  assert.equal(typeof obj.write,'undefined');
  assert.equal(typeof obj.importToFirestore,'undefined');
});
