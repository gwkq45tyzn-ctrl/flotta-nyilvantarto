import assert from 'node:assert/strict';
import {prepareFleetMigrationDryRun,parsePrivateInputArgs}
  from './fleet-migration-dryrun.mjs';

const clone=v=>JSON.parse(JSON.stringify(v));
const source=()=>({
  vehicles:[{id:'local-v1',rendszam:'ABC-123',gyartmany:'Ford',modell:'Transit',
    status:'aktiv',history:[{type:'service',km:1500}],
    note:'PRIVATE VEHICLE INFORMATION'}],
  drivers:[{id:'local-d1',daCode:'DA0001',name:'PRIVATE DRIVER NAME',
    agency:'TEST VENDOR',status:'aktiv',phone:'PRIVATE PHONE NUMBER'}],
  fuelCards:[{id:'private-card'}],contacts:[{id:'private-contact'}]
});
const input=()=>({local:source(),server:source(),backup:source()});
let r=prepareFleetMigrationDryRun(input());
assert.equal(r.status,'source-parity-review-only');
assert.deepEqual(r.holds,[]);
assert.equal(r.writesAllowed,false);
assert.equal(r.migrationAuthorized,false);
assert.equal(r.serverSourceAuthenticated,false);
assert.equal(r.firestoreEncodedSizeVerified,false);
assert.equal(r.backupRestoreIndependentlyTested,false);
assert.equal(r.hashes.local,r.hashes.server);
assert.equal(r.hashes.server,r.hashes.backup);
assert.equal(r.counts.local.vehicleHistory,1);
assert.equal(JSON.stringify(r).includes('PRIVATE'),false,'Do not leak names or notes in reports');

const mismatch=input();
mismatch.local.drivers[0].agency='CHANGED VENDOR';
r=prepareFleetMigrationDryRun(mismatch);
assert.equal(r.status,'blocked');
assert.ok(r.holds.some(x=>x.code==='LOCAL_VS_LEGACY_SERVER_CONFLICT'));

const pending=input();
pending.pending=clone(pending.local);
pending.pending.vehicles[0].history[0].km=1501;
r=prepareFleetMigrationDryRun(pending);
assert.ok(r.holds.some(x=>x.code==='UNRESOLVED_PENDING_LOCAL_CHANGES'));

const matchingPending=input();
matchingPending.pending=clone(matchingPending.server);
r=prepareFleetMigrationDryRun(matchingPending);
assert.equal(r.status,'source-parity-review-only');

const badBackup=input();
badBackup.backup.contacts.push({id:'different-contact'});
r=prepareFleetMigrationDryRun(badBackup);
assert.ok(r.holds.some(x=>x.code==='BACKUP_PARITY_CONFLICT'));

const duplicate=input();
duplicate.server.vehicles.push({...source().vehicles[0],id:'another-local-v',rendszam:'ABC123'});
r=prepareFleetMigrationDryRun(duplicate);
assert.ok(r.holds.some(x=>x.code==='UNRESOLVED_MASTER_MAPPING'&&x.source==='server'));

const oversize=input();
oversize.server.vehicles[0].note='x'.repeat(830000);
r=prepareFleetMigrationDryRun(oversize);
assert.ok(r.holds.some(x=>x.code==='JSON_SIZE_BUDGET_EXCEEDED'&&x.source==='server'));
assert.equal(r.firestoreEncodedSizeVerified,false);

const missing=prepareFleetMigrationDryRun({local:source(),backup:source()});
assert.ok(missing.holds.some(x=>x.code==='MISSING_OR_INVALID_SOURCE'&&x.source==='server'));
assert.equal(missing.migrationAuthorized,false);

assert.deepEqual(parsePrivateInputArgs([
  '--local','/private/a.json','--server','/private/b.json','--backup','/private/c.json'
]),{local:'/private/a.json',server:'/private/b.json',backup:'/private/c.json'});
assert.throws(()=>parsePrivateInputArgs(['--local','a.json']),/Missing required/);
assert.throws(()=>parsePrivateInputArgs(['--local','a','--local','b','--server','c','--backup','d']),/Duplicate/);
console.log('PASS: offline Fleet local/server/pending/backup parity, nested hashes, size and privacy (NO IMPORT)');
