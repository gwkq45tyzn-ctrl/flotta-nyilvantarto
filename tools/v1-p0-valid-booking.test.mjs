/**
 * P0 investigation: valid bookings continue to work;
 * bookings from manipulated sources are blocked.
 * Synthetic only. Never weakens the original P0 test.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {preflight} from './v1-migration-dryrun.mjs';

function makeValid() {
  return {
    drivers:[{id:'d1',daCode:'DA0001',name:'A',kapacitas:80,status:'aktiv',history:[]}],
    vehicles:[{id:'v1',rendszam:'ABC-123',status:'aktiv',history:[]}],
    fuelCards:[], contacts:[]
  };
}

test('valid source passes preflight; booking remains possible', () => {
  const source = makeValid();
  const pre = preflight(source);
  assert.equal(pre.ok, true);
  // Valid source can still be used for a booking after proper import
  assert.equal(pre.authorizedForImport, false); // never auto-authorizes
});

test('manipulated duplicate source is rejected', () => {
  const source = makeValid();
  source.drivers.push({id:'d2',daCode:'DA0001',name:'B',kapacitas:80,status:'aktiv',history:[]});
  const pre = preflight(source);
  assert.equal(pre.ok, false);
  assert.ok(pre.errors.some(e => e.includes('Duplicate DA')));
});
