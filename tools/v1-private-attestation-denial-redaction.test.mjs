/**
 * P0 private denial redaction. All fixtures are SYNTHETIC.
 * Attestation callers must not be able to accidentally log raw DA/plate IDs
 * or exception messages when owner-supplied source/backup is malformed.
 * Local signature integrity is NOT provenance or production import approval.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign,createHash} from 'node:crypto';
import {sha256,simulateBackup,buildPlan} from './v1-migration-dryrun.mjs';
import {verifyPinnedBackupContent,verifyPinnedImportSource}
  from './v1-pinned-backup-trust.mjs';
import {createSignedManifestContract}
  from './v1-signed-manifest-contract.mjs';
import {createLocalImporter} from './v1-privileged-importer-local.mjs';
import {createAuthenticatedSourceContract} from './v1-authenticated-source-contract.mjs';
import {createTrustedSignerContract} from './v1-trusted-signer-contract.mjs';
import {canonicalStringify} from '../features/migration-manifest.mjs';

const markers=[
  'PRIVATE_DA_CANARY','PRIVATE_PLATE_CANARY','PRIVATE_KEYED_CANARY',
  'PRIVATE_RAW_EXCEPTION_CANARY','PRIVATE_HISTORY_CANARY','PRIVATE_PHONE_CANARY'
];
const source=()=>({
  drivers:[
    {id:'d1',daCode:'PRIVATE_DA_CANARY',kapacitas:70,status:'aktiv',
      phone:'PRIVATE_PHONE_CANARY',history:[{deep:'PRIVATE_HISTORY_CANARY'}]},
    {id:'d2',daCode:'DA0002',kapacitas:60,status:'aktiv'}
  ],
  vehicles:[
    {id:'v1',rendszam:'PRIVATE-PLATE-CANARY',status:'aktiv',
      history:[{rich:{keep:true}}]},
    {id:'v2',rendszam:'ABC-123',status:'aktiv'}
  ],
  fuelCards:[{id:'f1'}],contacts:[{id:'c1'}]
});
function noLeak(value){
  const serialized=JSON.stringify(value);
  for(const marker of markers)
    assert.equal(serialized.includes(marker),false,'Denial leaked private value: '+marker);
}
const backup=(s)=>({
  type:'v1-full-rich-backup',version:2,imported:false,
  sourceSha256:sha256(s),
  counts:{drivers:s.drivers.length,vehicles:s.vehicles.length,
    fuelCards:s.fuelCards.length,contacts:s.contacts.length},
  snapshot:s
});
test('pinned backup invalid duplicate normalized DA rejects without identity in details',()=>{
  const s=source();s.drivers[1].daCode='private_da_canary';
  const r=verifyPinnedBackupContent({
    backup:backup(s),trustedPinnedSha:sha256(s),expectedRevision:1
  });
  assert.equal(r.ok,false);
  assert.equal(r.reason,'BACKUP_CONTENT_TAMPER');
  assert.equal(r.details,null);
  assert.equal(r.authorizedForImport,false);
  noLeak(r);
});
test('tampered rich keyed document denies parity WITHOUT leaking identifier/path lists',()=>{
  const s=source();
  // Use valid buildPlan() projection with synthetic but sensitive canary IDs.
  const p=buildPlan(s);
  const keyed={
    drivers:Object.fromEntries(p.drivers.map(v=>[v.id,structuredClone(v.data)])),
    vehicles:Object.fromEntries(p.vehicles.map(v=>[v.id,structuredClone(v.data)]))
  };
  keyed.drivers.PRIVATE_DA_CANARY.history[0].deep='TAMPERED';
  keyed.vehicles.PRIVATE_KEYED_CANARY={rendszam:'UNEXPECTED'};
  const r=verifyPinnedBackupContent({
    backup:simulateBackup(s),trustedPinnedSha:sha256(s),
    expectedRevision:1,observedKeyed:keyed
  });
  assert.equal(r.reason,'KEYED_PARITY_DENIED');
  assert.equal(r.details,null);
  assert.equal(r.authorizedForImport,false);
  noLeak(r);
});
test('owner supplied object with throwing source getter has fixed public denial',()=>{
  const s=source();
  Object.defineProperty(s.drivers[0],'daCode',{
    enumerable:true,configurable:true,get(){
      throw Error('PRIVATE_RAW_EXCEPTION_CANARY PRIVATE_DA_CANARY');
    }
  });
  const trusted='a'.repeat(64);
  const r=verifyPinnedImportSource({
    backup:{...backup(source()),sourceSha256:trusted,snapshot:s},
    trustedPinnedSha:trusted,expectedRevision:1
  });
  assert.equal(r.ok,false);
  assert.equal(r.reason,'BACKUP_CONTENT_TAMPER');
  noLeak(r);
});
test('trusted signed local manifest still cannot disclose source getter raw error',()=>{
  const s=source();
  const {privateKey,publicKey}=generateKeyPairSync('ed25519');
  const signingKey=publicKey.export({type:'spki',format:'der'}).toString('base64');
  const p=buildPlan(s);
  const canonicalPlanDigest=sha256([
    ...p.drivers.map(x=>'drivers/'+x.id),
    ...p.vehicles.map(x=>'vehicles/'+x.id)
  ].sort());
  const payload={
    schema:'imile-v1-offline-fleet-manifest-v1',
    purpose:'synthetic-preseal-dry-run',
    signerId:'local-test-owner',
    projectId:'demo-imile-v1-manifest',
    sourceSha256:sha256(s),
    sourceRevision:1,
    canonicalPlanDigest
  };
  const manifest={
    algorithm:'Ed25519',payload,
    signatureBase64:sign(null,Buffer.from(canonicalStringify(payload),'utf8'),
      privateKey).toString('base64')
  };
  const contract=createSignedManifestContract({
    trustedPublicKeySpkiBase64:signingKey,
    independentlyPinnedSourceSha256:sha256(s)
  });
  // Positive control: a locally valid signature + original source. Still
  // never establishes a real owner/production trust anchor or import authority.
  const ok=contract.verify(s,manifest,{backup:simulateBackup(s)});
  assert.equal(ok.ok,true,ok.reason);
  assert.equal(ok.authorizedForImport,false);
  assert.equal(ok.externalTrustRootAuthenticityVerified,false);
  const poisoned=structuredClone(s);
  Object.defineProperty(poisoned,'futurePrivateField',{
    enumerable:true,get(){throw Error('PRIVATE_RAW_EXCEPTION_CANARY')}
  });
  const denial=contract.verify(poisoned,manifest,{backup:simulateBackup(s)});
  assert.equal(denial.ok,false);
  assert.equal(denial.reason,'MALFORMED_SIGNATURE_OR_SOURCE');
  assert.equal(denial.authorizedForImport,false);
  noLeak(denial);
});
test('invalid Ed25519 SPKI parser error is redacted to a fixed error code',()=>{
  assert.throws(()=>{
    createSignedManifestContract({
      trustedPublicKeySpkiBase64:Buffer.alloc(90,3).toString('base64')
    });
  },e=>e.message==='INVALID_ED25519_PUBLIC_ROOT');
});


test('local importer and pinned-content wrapper cannot expose throwing source errors',async()=>{
  const good=source(),pin=sha256(good),saved=simulateBackup(good);
  const poisoned=structuredClone(good);
  Object.defineProperty(poisoned,'futurePrivateField',{
    enumerable:true,get(){throw Error('PRIVATE_RAW_EXCEPTION_CANARY PRIVATE_PHONE_CANARY');}
  });
  const importer=createLocalImporter({trustedPinnedSha:pin});
  const contract=createAuthenticatedSourceContract({externalPin:pin});
  for(const result of [await importer.importSource(poisoned,{backup:saved}),
    contract.verify(poisoned,{backup:saved})]){
    assert.equal(result.ok,false);assert.equal(result.authorizedForImport,false);noLeak(result);
  }
});

test('local importer rejects throwing backup option without leaking or throwing',async()=>{
  const s=source(),pin=sha256(s);
  const options={get backup(){throw Error('PRIVATE_RAW_EXCEPTION_CANARY');}};
  const result=await createLocalImporter({trustedPinnedSha:pin}).importSource(s,options);
  assert.equal(result.ok,false);noLeak(result);
});

test('trusted root wrapper contains exceptions before signature parsing and never authorizes',()=>{
  const root=generateKeyPairSync('ed25519');
  const der=root.publicKey.export({type:'spki',format:'der'});
  const contract=createTrustedSignerContract({rootPublicKeySpkiBase64:der.toString('base64'),
    independentlyPinnedRootSha256:createHash('sha256').update(der).digest('hex')});
  const input={manifest:{},snapshot:source(),backup:simulateBackup(source()),
    get registryBundle(){throw Error('PRIVATE_RAW_EXCEPTION_CANARY PRIVATE_DA_CANARY');}};
  const denial=contract.verify(input);
  assert.equal(denial.ok,false);assert.equal(denial.authorizedForImport,false);noLeak(denial);
});
