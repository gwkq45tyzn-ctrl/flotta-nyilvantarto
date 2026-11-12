/**
 * Tests for orphan inventory and signed manifest contract.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {inventoryKeyedState} from './v1-orphan-inventory.mjs';
import {createSignedManifestContract} from './v1-signed-manifest-contract.mjs';
import {sha256} from './v1-migration-dryrun.mjs';

const plan = {
  drivers:[{id:'DA0001'}],
  vehicles:[{id:'ABC123'}]
};

test('complete inventory matches', () => {
  const observed = {
    masters: {'drivers/DA0001': {}, 'vehicles/ABC123': {}},
    claims: {'drivers/DA0001': {}, 'vehicles/ABC123': {}}
  };
  const result = inventoryKeyedState(plan, observed);
  assert.equal(result.ok, true);
  assert.equal(result.sealed, false);
});

test('orphan master and missing claim are detected', () => {
  const observed = {
    masters: {'drivers/DA0001': {}, 'vehicles/ABC123': {}, 'drivers/ORPHAN': {}},
    claims: {'drivers/DA0001': {}}
  };
  const result = inventoryKeyedState(plan, observed);
  assert.equal(result.ok, false);
  assert.ok(result.issues.some(i => i.startsWith('ORPHAN_MASTER')));
  assert.ok(result.issues.some(i => i.startsWith('MISSING_CLAIM')));
});

test('signed manifest fails closed without external trust root', () => {
  const raw = {drivers:[], vehicles:[], fuelCards:[], contacts:[]};
  const pin = sha256(raw);
  const contract = createSignedManifestContract();
  const result = contract.verify(raw, {pin, signature: 'fake'});
  assert.equal(result.ok, false);
  assert.match(result.reason, /NO_EXTERNAL_TRUST_ROOT/);
});

test('matching external root and pin allows dry verification but never seals', () => {
  const raw = {drivers:[], vehicles:[], fuelCards:[], contacts:[]};
  const pin = sha256(raw);
  const root = 'external-test-root';
  const contract = createSignedManifestContract({trustRoot: root});
  const result = contract.verify(raw, {pin, signature: root});
  assert.equal(result.ok, true);
  assert.equal(result.sealed, false);
  assert.equal(result.authorizedForImport, false);
});
