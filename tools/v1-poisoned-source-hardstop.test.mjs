/**
 * #184 / #133 hard-stop: attestation must refuse poisoned source before any seal.
 * The Rules alone cannot detect duplicates after a privileged seed;
 * the importer attestation is the gate.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {attestBeforeSeal, refusePoisonedSeal} from './v1-trusted-importer-attestation.mjs';
import {sha256} from './v1-migration-dryrun.mjs';

const poisoned = {
  drivers:[
    {id:'d1',daCode:'DA0001',name:'A',kapacitas:80,status:'aktiv',history:[]},
    {id:'d2',daCode:'da0001',name:'B',kapacitas:500,status:'aktiv',history:[]}
  ],
  vehicles:[{id:'v1',rendszam:'ABC-123',status:'aktiv',history:[]}],
  fuelCards:[],contacts:[]
};

test('attestation refuses poisoned duplicate DA source before seal',()=>{
  const out = attestBeforeSeal(poisoned, {}, sha256(poisoned));
  assert.equal(out.ok, false);
  assert.match(out.reason || out.errors?.join(' ') || '', /Duplicate DA|PREFLIGHT/);
  assert.equal(refusePoisonedSeal(poisoned).sealed, false);
});

test('clean source still passes local parity (but not authorized)',()=>{
  const clean = {
    drivers:[{id:'d1',daCode:'DA0001',name:'A',kapacitas:80,status:'aktiv',history:[]}],
    vehicles:[{id:'v1',rendszam:'ABC-123',status:'aktiv',history:[]}],
    fuelCards:[],contacts:[]
  };
  // keyed state must match buildPlan output; for this unit we only check refusal path
  const out = refusePoisonedSeal(clean);
  assert.equal(out.sealed, false);
  assert.match(out.reason, /UNATTESTED/);
});
