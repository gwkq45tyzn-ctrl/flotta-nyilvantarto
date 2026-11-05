/**
 * Offline-only disaster-recovery CONTRACT tests using entirely synthetic Fleet data.
 * This is NOT a Firestore backup/restore integration test and grants no release GO.
 * We deliberately serialize to disk rather than comparing an in-memory clone.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const REQUIRED=['vehicles','drivers','fuelCards','contacts'];
function validFleet(data){
  if(!data||typeof data!=='object'||Array.isArray(data)||
     !REQUIRED.every(k=>Array.isArray(data[k]))||
     !Number.isSafeInteger(data.revision)||data.revision<0||
     typeof data.migrationSourceSha256!=='string'||
     !/^[a-f0-9]{64}$/.test(data.migrationSourceSha256))
    throw Error('INCOMPLETE_OR_INVALID_FLEET_SNAPSHOT');
}
function counts(data){
  return {
    vehicles:data.vehicles.length,drivers:data.drivers.length,
    fuelCards:data.fuelCards.length,contacts:data.contacts.length,
    vehicleHistory:data.vehicles.reduce((n,v)=>n+(Array.isArray(v.history)?v.history.length:0),0),
    driverHistory:data.drivers.reduce((n,d)=>n+(Array.isArray(d.history)?d.history.length:0),0)
  };
}
function makeSyntheticFleet(){
  return {
    revision:3,migrationSourceSha256:'a'.repeat(64),
    vehicles:[{
      rendszam:'ABC-123',status:'aktiv',vin:'SYNTHETIC-VIN',
      history:[{date:'2026-01-01',note:'Szerviz – olajcsere'},{date:'2026-02-01',note:'insurance'}],
      insurance:{validUntil:'2027-01-01',policy:'SYNTHETIC'},
      assignedDriver:'DA0001',fuelCardId:'FC001'
    }],
    drivers:[{
      daCode:'DA0001',name:'Teszt Futár',status:'aktiv',kapacitas:80,
      history:[{date:'2026-01-15',event:'assigned',vehicle:'ABC-123'}]
    }],
    fuelCards:[{id:'FC001',provider:'synthetic',pinNeverExported:true}],
    contacts:[{id:'CT001',name:'Teszt Kapcsolat',phone:'000'}]
  };
}
// The envelope includes the exact file bytes and independent digest, not a shallow object clone.
function exportEnvelope(data){
  validFleet(data);
  const payload=JSON.stringify(data);
  const bytes=Buffer.from(payload,'utf8');
  return JSON.stringify({format:'imile-v1-synthetic-only',sha256:sha256(bytes),
    revision:data.revision,sourceSha256:data.migrationSourceSha256,
    counts:counts(data),payload})+'\n';
}
function restoreEnvelope(backupBytes,{liveRevision=null}={}){
  let envelope;
  try{envelope=JSON.parse(backupBytes.toString('utf8'));}
  catch{throw Error('CORRUPT_BACKUP_FORMAT');}
  if(envelope?.format!=='imile-v1-synthetic-only'||
     typeof envelope?.payload!=='string'||
     !/^[a-f0-9]{64}$/.test(envelope?.sha256||'')||
     sha256(Buffer.from(envelope.payload,'utf8'))!==envelope.sha256)
    throw Error('BACKUP_SHA_MISMATCH');
  let fleet;
  try{fleet=JSON.parse(envelope.payload);}catch{throw Error('CORRUPT_BACKUP_PAYLOAD');}
  validFleet(fleet);
  if(fleet.revision!==envelope.revision||
     fleet.migrationSourceSha256!==envelope.sourceSha256||
     JSON.stringify(counts(fleet))!==JSON.stringify(envelope.counts))
    throw Error('BACKUP_METADATA_MISMATCH');
  // Never silently overwrite data written AFTER the backup was created.
  if(liveRevision!==null&&(!Number.isSafeInteger(liveRevision)||liveRevision>fleet.revision))
    throw Error('ROLLBACK_REQUIRES_RECONCILIATION');
  return fleet;
}

test('physical synthetic backup file round-trip preserves every rich Fleet field and UTF-8',()=>{
  const dir=mkdtempSync(join(tmpdir(),'imile-backup-qa-'));
  try{
    const fleet=makeSyntheticFleet();
    const exact=JSON.parse(JSON.stringify(fleet));
    const backupFile=join(dir,'fleet-synthetic-backup.json');
    writeFileSync(backupFile,exportEnvelope(fleet),{encoding:'utf8',flag:'wx',mode:0o600});
    // Simulate destructive local loss after a durable, complete on-disk export.
    fleet.vehicles.length=0;fleet.drivers[0].history.length=0;
    fleet.fuelCards.length=0;fleet.contacts.length=0;
    const restored=restoreEnvelope(readFileSync(backupFile),{liveRevision:3});
    assert.deepEqual(restored,exact);
    assert.equal(sha256(Buffer.from(JSON.stringify(restored))),sha256(Buffer.from(JSON.stringify(exact))));
    assert.deepEqual(counts(restored),{vehicles:1,drivers:1,fuelCards:1,contacts:1,vehicleHistory:2,driverHistory:1});
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test('truncated and tampered backup files are denied rather than partially restored',()=>{
  const envelope=exportEnvelope(makeSyntheticFleet());
  assert.throws(()=>restoreEnvelope(Buffer.from(envelope.slice(0,30))),/CORRUPT_BACKUP_FORMAT/);
  const forged=JSON.parse(envelope);
  forged.payload=forged.payload.replace('ABC-123','OTHER-PLATE');
  assert.throws(()=>restoreEnvelope(Buffer.from(JSON.stringify(forged))),/BACKUP_SHA_MISMATCH/);
  forged.sha256=sha256(Buffer.from(forged.payload));
  forged.counts.vehicles=500;
  assert.throws(()=>restoreEnvelope(Buffer.from(JSON.stringify(forged))),/BACKUP_METADATA_MISMATCH/);
});

test('missing Fleet arrays, missing SHA, and dangerous rollback revision are rejected',()=>{
  const fleet=makeSyntheticFleet();
  delete fleet.contacts;
  assert.throws(()=>exportEnvelope(fleet),/INCOMPLETE_OR_INVALID_FLEET_SNAPSHOT/);
  const original=makeSyntheticFleet();
  original.migrationSourceSha256='';
  assert.throws(()=>exportEnvelope(original),/INCOMPLETE_OR_INVALID_FLEET_SNAPSHOT/);
  const bytes=Buffer.from(exportEnvelope(makeSyntheticFleet()));
  assert.throws(()=>restoreEnvelope(bytes,{liveRevision:4}),/ROLLBACK_REQUIRES_RECONCILIATION/);
  assert.equal(restoreEnvelope(bytes,{liveRevision:3}).revision,3);
});

test('oversized original Fleet is detected for separate Firestore document-size preflight',()=>{
  const fleet=makeSyntheticFleet();
  fleet.vehicles[0].history.push({note:'Z'.repeat(1_100_000)});
  const bytes=Buffer.byteLength(JSON.stringify(fleet),'utf8');
  assert.ok(bytes>1_048_576,'Large synthetic snapshot should exceed 1 MiB');
  // JSON bytes are a warning, not a valid Firestore protobuf size calculator.
  // The original rich snapshot must not be truncated to make it fit.
  assert.equal(fleet.vehicles[0].history.at(-1).note.length,1_100_000);
});

console.log('offline synthetic backup/restore CONTRACT tests only; NO FIRESTORE RESTORE, NO RELEASE GO');
