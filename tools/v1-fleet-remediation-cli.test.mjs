import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync,statSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {sha256} from './v1-migration-dryrun.mjs';
import {syntheticFourBlockSource} from './v1-variable-block-migration.mjs';
import {runPrivateFleetPreparation} from './v1-fleet-remediation-cli.mjs';

function localFixture(t){
  const temp=mkdtempSync(join(tmpdir(),'imile-v1-private-'));
  t.after(()=>rmSync(temp,{recursive:true,force:true}));
  const original=syntheticFourBlockSource({
    drivers:12,vehicles:14,fuelCards:14,contacts:5
  });
  for(const row of original.drivers)delete row.kapacitas;
  for(const i of [0,3,9])original.drivers[i].status='ismeretlen';
  const source=join(temp,'original.json');
  const patches=join(temp,'owner-specific-patches.json');
  const output=join(temp,'candidate.json');
  writeFileSync(source,JSON.stringify(original),{mode:0o600});
  const changes=original.drivers.map((d,index)=>({
    index,expectedDaCode:d.daCode,capacity:70,
    ...([0,3,9].includes(index)?{status:'inaktiv'}:{})
  }));
  writeFileSync(patches,JSON.stringify(changes),{mode:0o600});
  return {temp,original,source,patches,output,changes,sha:sha256(original)};
}

test('audit prints redacted counts and digest, not driver or vehicle identifiers',t=>{
  const f=localFixture(t);
  const report=runPrivateFleetPreparation(['audit','--input',f.source]);
  assert.equal(report.ready,false);
  assert.deepEqual(report.counts,{drivers:12,vehicles:14,fuelCards:14,contacts:5});
  assert.equal(report.missingCapacityCount,12);
  assert.equal(report.unknownStatusCount,3);
  assert.equal(report.originalSha256,f.sha);
  assert.equal(report.authorizedForImport,false);
  const s=JSON.stringify(report);
  assert.ok(!s.includes(f.original.drivers[0].daCode));
  assert.ok(!s.includes(f.original.drivers[0].name));
  assert.ok(!s.includes(f.original.vehicles[0].rendszam));
});

test('explicit per-driver patch writes a private mode-0600 candidate outside Git',t=>{
  const f=localFixture(t);
  const result=runPrivateFleetPreparation([
    'prepare','--input',f.source,'--patches',f.patches,
    '--expected-sha',f.sha,'--output',f.output
  ]);
  assert.equal(result.ready,true);
  assert.equal(result.authorizedForImport,false);
  assert.equal(result.ownerApprovalAuthenticated,false);
  assert.equal(result.productionSealAllowed,false);
  assert.equal(result.patchedDriverCount,12);
  const candidate=JSON.parse(readFileSync(f.output,'utf8'));
  assert.deepEqual(candidate.vehicles,f.original.vehicles);
  assert.deepEqual(candidate.fuelCards,f.original.fuelCards);
  assert.deepEqual(candidate.contacts,f.original.contacts);
  assert.equal(candidate.drivers[0].kapacitas,70);
  assert.equal(candidate.drivers[0].status,'inaktiv');
  assert.equal(candidate.drivers[1].status,'aktiv');
  assert.equal(statSync(f.output).mode&0o777,0o600);
  assert.equal(sha256(f.original),f.sha);
});

test('wrong digest, duplicate output and output under Git checkout are all denied',t=>{
  const f=localFixture(t);
  const args=[
    'prepare','--input',f.source,'--patches',f.patches,
    '--expected-sha',f.sha,'--output',f.output
  ];
  assert.throws(()=>runPrivateFleetPreparation(
    args.map(v=>v===f.sha?'0'.repeat(64):v)),/ORIGINAL_SOURCE_SHA_MISMATCH/);
  assert.throws(()=>runPrivateFleetPreparation(
    args.map(v=>v===f.output?resolve('fleet-private-do-not-create.json'):v)),
    /PRIVATE_OUTPUT_MUST_BE_OUTSIDE_GIT_CHECKOUT/);
  runPrivateFleetPreparation(args);
  assert.throws(()=>runPrivateFleetPreparation(args),/PRIVATE_OUTPUT_CREATE_DENIED/);
});

test('audit refuses write flags, and incomplete patches cannot create a candidate',t=>{
  const f=localFixture(t);
  assert.throws(()=>runPrivateFleetPreparation([
    'audit','--input',f.source,'--output',f.output
  ]),/AUDIT_IS_READ_ONLY/);
  assert.throws(()=>runPrivateFleetPreparation([
    'prepare','--input',f.source,'--patches',f.patches,'--output',f.output
  ]),/PRIVATE_PATCH_OUTPUT_AND_SHA_REQUIRED/);
  writeFileSync(f.patches,JSON.stringify(f.changes.slice(0,11)));
  assert.throws(()=>runPrivateFleetPreparation([
    'prepare','--input',f.source,'--patches',f.patches,
    '--expected-sha',f.sha,'--output',f.output
  ]),/CANDIDATE_NOT_IMPORT_READY/);
  assert.throws(()=>readFileSync(f.output,'utf8'),/ENOENT/);
});

test('reject oversized private JSON and unsupported flags without exposing raw input',t=>{
  const f=localFixture(t);
  writeFileSync(f.source,'x'.repeat(2*1024*1024+1));
  assert.throws(()=>runPrivateFleetPreparation([
    'audit','--input',f.source
  ]),/PRIVATE_SOURCE_UNAVAILABLE_OR_NOT_JSON/);
  assert.throws(()=>runPrivateFleetPreparation([
    'audit','--input',f.source,'--execute-import','yes'
  ]),/INVALID_OR_DUPLICATE_ARGUMENT/);
});
