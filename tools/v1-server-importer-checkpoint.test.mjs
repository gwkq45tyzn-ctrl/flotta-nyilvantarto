/**
 * Attack and positive tests for the server importer checkpoint.
 * P0 poisoned path remains DENY. Seal always refused.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServerImporter} from './v1-server-importer-checkpoint.mjs';
import {sha256, simulateBackup} from './v1-migration-dryrun.mjs';

const clean = () => ({
  drivers:[{id:'d1',daCode:'DA0001',name:'A',kapacitas:80,status:'aktiv',history:[]}],
  vehicles:[{id:'v1',rendszam:'ABC-123',status:'aktiv',history:[]}],
  fuelCards:[],contacts:[]
});

test('poisoned source cannot begin checkpoint', async () => {
  const raw = clean();
  raw.drivers.push({id:'d2',daCode:'da0001',name:'B',kapacitas:1,status:'aktiv',history:[]});
  const pin = sha256(raw);
  const backup = {type:'v1-full-rich-backup',version:2,sourceSha256:pin,snapshot:raw,
    counts:{drivers:2,vehicles:1,fuelCards:0,contacts:0},imported:false};
  const importer = createServerImporter({trustedPinnedSha: pin});
  const result = await importer.begin(raw, backup);
  assert.equal(result.ok, false);
  assert.equal(result.sealed, false);
});

test('clean source can begin and apply batches but cannot seal', async () => {
  const raw = clean();
  const pin = sha256(raw);
  const backup = simulateBackup(raw);
  const importer = createServerImporter({trustedPinnedSha: pin});
  const begin = await importer.begin(raw, backup);
  assert.equal(begin.ok, true);
  assert.equal(begin.sealed, false);
  const batch = await importer.applyBatch(['drivers/DA0001','vehicles/ABC123']);
  assert.equal(batch.ok, true);
  const seal = await importer.seal();
  assert.equal(seal.ok, false);
  assert.equal(seal.sealed, false);
  assert.match(seal.reason, /NO_PRODUCTION_IAM_PROOF/);
});

test('seal without begin is denied', async () => {
  const importer = createServerImporter({trustedPinnedSha: 'a'.repeat(64)});
  const seal = await importer.seal();
  assert.equal(seal.ok, false);
});
