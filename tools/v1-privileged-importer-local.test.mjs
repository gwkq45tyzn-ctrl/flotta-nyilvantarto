/**
 * Tests for the local privileged importer adapter.
 * Poisoned sources must be rejected before any write intent.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createLocalImporter} from './v1-privileged-importer-local.mjs';

const clean = {
  drivers:[{id:'d1',daCode:'DA0001',name:'A',kapacitas:80,status:'aktiv',history:[]}],
  vehicles:[{id:'v1',rendszam:'ABC-123',status:'aktiv',history:[]}],
  fuelCards:[],contacts:[]
};

const poisoned = {
  drivers:[
    {id:'d1',daCode:'DA0001',name:'A',kapacitas:80,status:'aktiv',history:[]},
    {id:'d2',daCode:'da0001',name:'B',kapacitas:500,status:'aktiv',history:[]}
  ],
  vehicles:[{id:'v1',rendszam:'ABC-123',status:'aktiv',history:[]}],
  fuelCards:[],contacts:[]
};

test('poisoned duplicate DA is rejected before any write', async () => {
  const importer = createLocalImporter({dryRun: true});
  const result = await importer.importSource(poisoned);
  assert.equal(result.ok, false);
  assert.equal(result.sealed, false);
  assert.equal(result.authorizedForImport, false);
  assert.match(result.reason || '', /PREFLIGHT|Duplicate/);
});

test('clean source passes dry-run attestation but does not seal', async () => {
  const importer = createLocalImporter({dryRun: true});
  const result = await importer.importSource(clean);
  assert.equal(result.ok, true);
  assert.equal(result.sealed, false);
  assert.equal(result.authorizedForImport, false);
  assert.match(result.reason, /DRY_RUN/);
});

test('non-dry-run still refuses seal without production IAM proof', async () => {
  const importer = createLocalImporter({dryRun: false});
  const result = await importer.importSource(clean);
  assert.equal(result.ok, false);
  assert.equal(result.sealed, false);
  assert.match(result.reason, /NO_PRODUCTION_IAM_PROOF/);
});
