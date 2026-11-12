/**
 * Tests for the authenticated source contract.
 * Caller-supplied pin, revision or approval is always DENY.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createAuthenticatedSourceContract} from './v1-authenticated-source-contract.mjs';
import {sha256} from './v1-migration-dryrun.mjs';

const clean = () => ({
  drivers:[{id:'d1',daCode:'DA0001',name:'A',kapacitas:80,status:'aktiv',history:[]}],
  vehicles:[{id:'v1',rendszam:'ABC-123',status:'aktiv',history:[]}],
  fuelCards:[],contacts:[]
});

test('matching external pin allows dry verification but never seals', () => {
  const raw = clean();
  const pin = sha256(raw);
  const contract = createAuthenticatedSourceContract({externalPin: pin});
  const result = contract.verify(raw);
  assert.equal(result.ok, true);
  assert.equal(result.sealed, false);
  assert.equal(result.authorizedForImport, false);
  assert.equal(result.productionIamVerified, false);
});

test('caller-supplied pin, revision or approval is denied', () => {
  const raw = clean();
  const pin = sha256(raw);
  const contract = createAuthenticatedSourceContract({externalPin: pin});
  const result = contract.verify(raw, pin, 1, true);
  assert.equal(result.ok, false);
  assert.match(result.reason, /UNTRUSTED_CALLER_SUPPLIED_AUTHORITY/);
});

test('mismatched source SHA is denied', () => {
  const raw = clean();
  const pin = sha256(raw);
  const contract = createAuthenticatedSourceContract({externalPin: pin});
  const modified = structuredClone(raw);
  modified.drivers[0].kapacitas = 999;
  const result = contract.verify(modified);
  assert.equal(result.ok, false);
  assert.match(result.reason, /SOURCE_SHA_MISMATCH/);
});
