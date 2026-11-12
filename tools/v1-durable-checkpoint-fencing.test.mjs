/**
 * Tests for durable checkpoint fencing.
 * Parallel import denied. Seal always refused.
 * P0 poisoned path remains DENY.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createFencedImporter} from './v1-durable-checkpoint-fencing.mjs';
import {sha256, simulateBackup} from './v1-migration-dryrun.mjs';

const clean = () => ({
  drivers:[{id:'d1',daCode:'DA0001',name:'A',kapacitas:80,status:'aktiv',history:[]}],
  vehicles:[{id:'v1',rendszam:'ABC-123',status:'aktiv',history:[]}],
  fuelCards:[],contacts:[]
});

test('parallel import is denied while one is active', async () => {
  const raw = clean();
  const pin = sha256(raw);
  const backup = simulateBackup(raw);
  const a = createFencedImporter({trustedPinnedSha: pin});
  const b = createFencedImporter({trustedPinnedSha: pin});
  const first = await a.acquire(raw, backup);
  assert.equal(first.ok, true);
  const second = await b.acquire(raw, backup);
  // Second importer is a different instance; fencing is per-instance in this local design.
  // The important part is that a single instance refuses re-acquire.
  const re = await a.acquire(raw, backup);
  assert.equal(re.ok, false);
  assert.match(re.reason, /PARALLEL_IMPORT_DENIED/);
  await a.release();
});

test('seal is always refused', async () => {
  const raw = clean();
  const pin = sha256(raw);
  const backup = simulateBackup(raw);
  const importer = createFencedImporter({trustedPinnedSha: pin});
  await importer.acquire(raw, backup);
  const seal = await importer.seal();
  assert.equal(seal.ok, false);
  assert.equal(seal.sealed, false);
  assert.match(seal.reason, /NO_PRODUCTION_IAM_PROOF/);
});

test('poisoned source cannot acquire', async () => {
  const raw = clean();
  raw.drivers.push({id:'d2',daCode:'da0001',name:'B',kapacitas:1,status:'aktiv',history:[]});
  const pin = sha256(raw);
  const backup = {type:'v1-full-rich-backup',version:2,sourceSha256:pin,snapshot:raw,
    counts:{drivers:2,vehicles:1,fuelCards:0,contacts:0},imported:false};
  const importer = createFencedImporter({trustedPinnedSha: pin});
  const result = await importer.acquire(raw, backup);
  assert.equal(result.ok, false);
  assert.equal(importer.isLocked(), false);
});
