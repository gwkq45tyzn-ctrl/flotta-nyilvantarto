/**
 * #184 independent, fail-closed OFFLINE attestation acceptance.
 * These tests do NOT prove a production privileged importer or IAM policy.
 * In particular, a locally computed claimed SHA is not a trusted remote SHA.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {attestBeforeSeal, refusePoisonedSeal}
  from './v1-trusted-importer-attestation.mjs';
import {sha256,buildPlan}
  from './v1-migration-dryrun.mjs';

const clean=()=>({
  drivers:[{id:'d1',daCode:'DA0001',name:'A',kapacitas:80,status:'aktiv',
    history:[{event:'hire',metadata:{source:'synthetic'}}]}],
  vehicles:[{id:'v1',rendszam:'ABC-123',status:'aktiv',
    history:[{event:'service',details:{ok:true}}]}],
  fuelCards:[{id:'f1',extra:{fuel:true}}],
  contacts:[{id:'c1',history:[{e:'created'}]}],
  futureRoot:{keep:true}
});
const trustedKeyed=snapshot=>{
  const plan=buildPlan(snapshot);
  return {
    drivers:Object.fromEntries(plan.drivers.map(x=>[x.id,x.data])),
    vehicles:Object.fromEntries(plan.vehicles.map(x=>[x.id,x.data]))
  };
};
const check=(snapshot,keyed=trustedKeyed(snapshot),sha=sha256(snapshot))=>
  attestBeforeSeal(snapshot,keyed,sha);

test('positive: complete full-rich source and exactly keyed driver/vehicle parity ALLOW locally',()=>{
  const raw=clean(),out=check(raw);
  assert.equal(out.ok,true,JSON.stringify(out));
  assert.equal(out.sourceSha256,sha256(raw));
  assert.equal(out.plan.drivers[0].data.sourceIndex,0);
  assert.equal(out.plan.vehicles[0].data.sourceIndex,0);
  assert.deepEqual(out.plan.drivers[0].data.history,raw.drivers[0].history);
  assert.deepEqual(out.plan.vehicles[0].data.history,raw.vehicles[0].history);
  assert.equal(out.authorizedForImport,false);
  assert.equal(out.sealed,false);
});

test('wrong SHA, including valid-looking checksum, must DENY',()=>{
  const raw=clean(),out=check(raw,trustedKeyed(raw),'0'.repeat(64));
  assert.equal(out.ok,false);
  assert.equal(out.reason,'SHA_MISMATCH');
});
test('full-rich keyed mismatch DENY: mutated nested history',()=>{
  const raw=clean(),keyed=trustedKeyed(raw);
  keyed.vehicles.ABC123.history[0].details.ok=false;
  const out=check(raw,keyed);
  assert.equal(out.ok,false);
  assert.equal(out.reason,'KEYED_PARITY_OR_PARTIAL');
  assert.ok(out.details.mismatched.includes('vehicles/ABC123'));
});
test('extra canonical keyed document must DENY',()=>{
  const raw=clean(),keyed=trustedKeyed(raw);
  keyed.drivers.ROGUE999={daCode:'ROGUE999',status:'aktiv'};
  const out=check(raw,keyed);
  assert.equal(out.ok,false);
  assert.ok(out.details.unexpected.includes('drivers/ROGUE999'));
});
test('missing original keyed driver must DENY',()=>{
  const raw=clean(),keyed=trustedKeyed(raw);
  delete keyed.drivers.DA0001;
  const out=check(raw,keyed);
  assert.equal(out.ok,false);
  assert.ok(out.details.missing.includes('drivers/DA0001'));
});
test('missing keyed namespace must not be interpreted as complete',()=>{
  const raw=clean(),keyed={drivers:trustedKeyed(raw).drivers};
  const out=check(raw,keyed);
  assert.equal(out.ok,false);
  assert.equal(out.reason,'KEYED_PARITY_OR_PARTIAL');
});
test('even a sourceIndex equal to the original array position DENY before import',()=>{
  for(const [kind,idx] of [['drivers',0],['vehicles',0]]){
    const raw=clean();
    raw[kind][idx].sourceIndex=idx;
    const out=attestBeforeSeal(raw,{},sha256(raw));
    assert.equal(out.ok,false,kind);
    assert.match(out.errors.join(' '),/sourceIndex/i);
    assert.equal(refusePoisonedSeal(raw).sealed,false);
  }
});
test('duplicate DA, including mixed-case normalized variant DENY',()=>{
  const raw=clean();
  raw.drivers.push({id:'d2',daCode:'da0001',status:'aktiv',kapacitas:50});
  const out=attestBeforeSeal(raw,{},sha256(raw));
  assert.equal(out.ok,false);
  assert.match(out.errors.join(' '),/Duplicate DA/);
  assert.equal(refusePoisonedSeal(raw).sealed,false);
});
test('duplicate normalized license plate DENY, regardless of separator',()=>{
  const raw=clean();
  raw.vehicles.push({id:'v2',rendszam:'abc 123',status:'aktiv'});
  const out=attestBeforeSeal(raw,{},sha256(raw));
  assert.equal(out.ok,false);
  assert.match(out.errors.join(' '),/Duplicate plate/);
  assert.equal(refusePoisonedSeal(raw).sealed,false);
});
test('changed source after trusted backup SHA must DENY, including contact metadata',()=>{
  const raw=clean(),originalSha=sha256(raw),keyed=trustedKeyed(raw);
  raw.contacts[0].history[0].e='tampered';
  const out=attestBeforeSeal(raw,keyed,originalSha);
  assert.equal(out.ok,false);
  assert.equal(out.reason,'SHA_MISMATCH');
});
test('refusePoisonedSeal never seals even a valid snapshot (no privilege bridge)',()=>{
  const raw=clean(),out=refusePoisonedSeal(raw);
  assert.equal(out.sealed,false);
  assert.match(out.reason,/UNATTESTED/);
});
