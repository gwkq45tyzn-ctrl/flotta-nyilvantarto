/**
 * Independent hostile-input acceptance for #155 offline-only migration.
 * All records and temporary files are synthetic; never connects to a network.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {preflight,buildPlan,simulateBackup,restoreDrill,detectPartial,sha256}
  from './v1-migration-dryrun.mjs';

const synthetic=()=>({
  vehicles:[{id:'v1',rendszam:'ABC-123',status:'aktiv',alvazszam:'SYNTHETIC-VIN',
    km:12345,history:[{event:'szerviz',note:'ááá'}],extra:{future:[1,{x:'z'}]}}],
  drivers:[{id:'d1',daCode:'DA0001',name:'Synthetic courier',kapacitas:80,
    status:'aktiv',history:[{event:'start',date:'2026-01-01'}],extra:{future:'keep'}}],
  fuelCards:[{id:'fuel-1',history:[{litres:5}],extra:{token:'synthetic'}}],
  contacts:[{id:'contact-1',history:[{name:'synthetic'}],custom:{nested:true}}],
  futureSourceField:{retained:true}
});
test('full rich raw Fleet plates, driver code, metadata and history survive plan and backup',()=>{
  const data=synthetic(), pre=preflight(data);
  assert.equal(pre.ok,true,JSON.stringify(pre.errors));
  const plan=buildPlan(data,pre);
  assert.equal(plan.vehicles[0].id,'ABC123');
  assert.equal(plan.vehicles[0].data.rendszam,'ABC-123','raw original plate must remain unchanged');
  assert.deepEqual(plan.vehicles[0].data.history,data.vehicles[0].history);
  assert.equal(plan.vehicles[0].data.alvazszam,'SYNTHETIC-VIN');
  assert.deepEqual(plan.drivers[0].data.extra,data.drivers[0].extra);
  const backup=simulateBackup(data);
  assert.deepEqual(backup.snapshot,data,'full source, including future fields, must survive backup');
  assert.equal(restoreDrill(backup,pre.sourceSha256).ok,true);
});
test('mutated backed up history or unknown deep field is rejected despite unchanged SHA header',()=>{
  const snap=synthetic(), backup=simulateBackup(snap);
  backup.snapshot.vehicles[0].history=[];
  assert.equal(restoreDrill(backup,backup.sourceSha256).ok,false);
  const b2=simulateBackup(snap);
  b2.snapshot.contacts[0].custom.nested=false;
  assert.equal(restoreDrill(b2,b2.sourceSha256).ok,false);
});
test('canonical SHA is invariant to JSON key order but not altered content',()=>{
  const a=synthetic(),b=JSON.parse(JSON.stringify(a));
  b.vehicles[0]={history:b.vehicles[0].history,extra:b.vehicles[0].extra,
    km:12345,alvazszam:'SYNTHETIC-VIN',status:'aktiv',rendszam:'ABC-123',id:'v1'};
  assert.equal(sha256(a),sha256(b));
  b.vehicles[0].history[0].note='changed';
  assert.notEqual(sha256(a),sha256(b));
});
test('preflight refuses duplicate normalized plate and DA identities',()=>{
  const bad=synthetic();
  bad.vehicles.push({...bad.vehicles[0],id:'v2',rendszam:'ABC123'});
  assert.equal(preflight(bad).ok,false);
  const bad2=synthetic();
  bad2.drivers.push({...bad2.drivers[0],id:'d2',daCode:'da0001'});
  assert.equal(preflight(bad2).ok,false);
});
test('invalid or duplicate original stable ID and missing arrays fail closed',()=>{
  const bad=synthetic();bad.drivers.push({...bad.drivers[0],daCode:'DA0002'});
  assert.equal(preflight(bad).ok,false);
  assert.equal(preflight({drivers:[]}).ok,false);
  assert.equal(preflight(null).ok,false);
});
test('UTF-8 byte budget and non-JSON sources cannot authorize a plan',()=>{
  const huge=synthetic();
  huge.contacts[0].name='á'.repeat(500000);
  const r=preflight(huge);
  assert.equal(r.ok,false);
  assert.ok(r.jsonBytes>800*1024);
  assert.throws(()=>buildPlan(huge));
  const invalid=synthetic(); invalid.contacts[0].invalid=Infinity;
  assert.equal(preflight(invalid).ok,false);
});
test('privileged sourceIndex must never be inherited from raw legacy data even when matching array index',()=>{
  const matchingDriver=synthetic();
  matchingDriver.drivers[0].sourceIndex=0;
  const driverCheck=preflight(matchingDriver);
  assert.equal(driverCheck.ok,false);
  assert.match(driverCheck.errors.join(' '),/Untrusted pre-existing sourceIndex/);
  assert.throws(()=>buildPlan(matchingDriver),/Untrusted pre-existing sourceIndex/);
  const matchingVehicle=synthetic();
  matchingVehicle.vehicles[0].sourceIndex=0;
  assert.equal(preflight(matchingVehicle).ok,false);
  assert.throws(()=>buildPlan(matchingVehicle),/Untrusted pre-existing sourceIndex/);
});
test('preflight source SHA cannot be substituted after source changes',()=>{
  const input=synthetic(), pre=preflight(input);
  input.drivers[0].kapacitas=90;
  assert.throws(()=>buildPlan(input,pre),/mismatch/);
});
test('interrupted keyed migration checks exact field hashes and unexpected docs',()=>{
  const data=synthetic(),plan=buildPlan(data);
  const drivers=Object.fromEntries(plan.drivers.map(d=>[d.id,d.data]));
  const vehicles=Object.fromEntries(plan.vehicles.map(v=>[v.id,v.data]));
  assert.equal(detectPartial(plan,{drivers,vehicles}).complete,true);
  assert.equal(detectPartial(plan,{drivers,vehicles:{}}).complete,false);
  const badVehicles=structuredClone(vehicles);
  badVehicles.ABC123.history=[];
  const partial=detectPartial(plan,{drivers,vehicles:badVehicles});
  assert.equal(partial.complete,false);
  assert.ok(partial.mismatched.includes('vehicles/ABC123'));
  assert.equal(detectPartial(plan,{drivers,vehicles:{...vehicles,XYZ999:{status:'aktiv'}}}).complete,false);
  assert.equal(detectPartial(plan,{DA0001:true,ABC123:true}).complete,false);
});
test('CLI failed preflight/restore return nonzero; synthetic --output does not overwrite',()=>{
  const folder=mkdtempSync(join(tmpdir(),'imile-v1-synthetic-'));
  const script=resolve('tools/v1-migration-dryrun.mjs');
  const run=(...args)=>spawnSync(process.execPath,[script,...args],{encoding:'utf8',timeout:10000});
  try{
    const good=synthetic(),bad=synthetic();
    bad.drivers.push({...bad.drivers[0],id:'d2',daCode:'da0001'});
    const goodPath=join(folder,'good.json'),badPath=join(folder,'bad.json');
    const backupPath=join(folder,'backup.json'),planPath=join(folder,'plan.json');
    writeFileSync(goodPath,JSON.stringify(good));writeFileSync(badPath,JSON.stringify(bad));
    const invalid=run('preflight','--input='+badPath);
    assert.equal(invalid.status,2);
    assert.equal(run('dry-run','--input='+badPath).status,2);
    const backup=run('backup','--input='+goodPath,'--output='+backupPath);
    assert.equal(backup.status,0,backup.stderr);
    assert.equal(existsSync(backupPath),true);
    const expected=preflight(good).sourceSha256;
    const wrong=run('restore-drill','--backup='+backupPath,'--expected-sha='+'0'.repeat(64));
    assert.equal(wrong.status,2);
    const valid=run('restore-drill','--backup='+backupPath,'--expected-sha='+expected);
    assert.equal(valid.status,0,valid.stderr);
    const plan=run('dry-run','--input='+goodPath,'--output='+planPath);
    assert.equal(plan.status,0,plan.stderr);
    assert.equal(run('dry-run','--input='+goodPath,'--output='+planPath).status,2);
    assert.equal(JSON.parse(readFileSync(planPath,'utf8')).authorizedForImport,false);
    const forged=JSON.parse(readFileSync(backupPath,'utf8'));
    forged.snapshot.drivers[0].history=[];
    writeFileSync(backupPath,JSON.stringify(forged));
    assert.equal(run('restore-drill','--backup='+backupPath,'--expected-sha='+expected).status,2);
  }finally{rmSync(folder,{recursive:true,force:true});}
});
