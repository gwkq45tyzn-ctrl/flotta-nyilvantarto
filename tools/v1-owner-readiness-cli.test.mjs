import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {assessPrivateFleetExport} from './v1-owner-readiness-cli.mjs';

const script=resolve('tools/v1-owner-readiness-cli.mjs');
const source=()=>({
  vehicles:Array.from({length:14},(_,i)=>({
    id:'synthetic-v-'+i,rendszam:'ABC-'+String(100+i),
    status:'aktiv',history:[{note:'SYNTHETIC_HIST_PRIVATE_CANARY'}]
  })),
  drivers:Array.from({length:12},(_,i)=>({
    id:'synthetic-d-'+i,daCode:'DA'+String(i+1).padStart(4,'0'),
    name:'SECRET_DRIVER_CANARY',phone:'SECRET_PHONE_CANARY',
    status:i<6?'aktiv':i<9?'inaktiv':'ismeretlen',
    history:[{note:'SYNTHETIC_DRIVER_HISTORY'}]
  })),
  fuelCards:Array.from({length:14},(_,i)=>({id:'f-'+i,number:'SECRET_FUEL_CARD_CANARY'})),
  contacts:Array.from({length:5},(_,i)=>({id:'c-'+i,name:'SECRET_CONTACT_CANARY'}))
});
const run=(text,options=[])=>{
  const folder=mkdtempSync(join(tmpdir(),'imile-private-owner-qa-'));
  try{
    const input=join(folder,'private-source.json');
    writeFileSync(input,text,'utf8');
    return spawnSync(process.execPath,[script,'--input',input,...options],{
      encoding:'utf8',cwd:resolve('.'),timeout:15000
    });
  }finally{rmSync(folder,{recursive:true,force:true})}
};
test('realistic 12/14/14/5 structure detects six missing active capacities privately',()=>{
  const data=source();
  const output=run(JSON.stringify(data),['--json']);
  assert.equal(output.status,2,output.stderr);
  const r=JSON.parse(output.stdout);
  assert.equal(r.operationallyReady,false);
  assert.equal(r.sourcePreflightOk,true);
  assert.equal(r.counts.drivers,12);
  assert.equal(r.counts.vehicles,14);
  assert.equal(r.counts.fuelCards,14);
  assert.equal(r.counts.contacts,5);
  assert.equal(r.counts.activeDrivers,6);
  assert.equal(r.counts.activeWithoutCapacity,6);
  assert.equal(r.counts.uncertainDriverStatuses,3);
  assert.ok(r.reasons.includes('ACTIVE_DRIVER_CAPACITY_UNSET_OR_INVALID'));
  assert.equal(r.authorizedForImport,false);
  assert.equal(r.ownerApprovalVerified,false);
  assert.equal(r.independentSourcePinVerified,false);
  for(const secret of ['SECRET_DRIVER_CANARY','SECRET_PHONE_CANARY',
    'SECRET_FUEL_CARD_CANARY','SECRET_CONTACT_CANARY','DA0001','ABC-100']){
    assert.equal(output.stdout.includes(secret),false,
      'CLI must never print private field '+secret);
    assert.equal(output.stderr.includes(secret),false);
  }
});
test('valid privately prepared source returns 0 but never authorizes import',()=>{
  const data=source();
  for(let i=0;i<6;i++)data.drivers[i].kapacitas=70;
  const output=run(JSON.stringify(data),['--json']);
  assert.equal(output.status,0,output.stderr);
  const r=JSON.parse(output.stdout);
  assert.equal(r.operationallyReady,true);
  assert.equal(r.sourcePreflightOk,true);
  assert.equal(r.counts.activeWithoutCapacity,0);
  assert.ok(r.warnings.includes('DRIVER_STATUS_NEEDS_OWNER_REVIEW'));
  assert.match(r.untrustedLocalSourceSha256,/^[a-f0-9]{64}$/);
  assert.equal(r.productionIamVerified,false);
  assert.equal(r.authorizedForImport,false);
  assert.equal(r.readOnly,true);
});
test('private 30 drivers + 27 vehicles rejects 122/120 owned reads before import',()=>{
  const data=source();
  for(let i=0;i<6;i++)data.drivers[i].kapacitas=70;
  for(let i=12;i<30;i++)data.drivers.push({
    id:'synthetic-d-'+i,daCode:'DA'+String(i+1).padStart(4,'0'),status:'inaktiv'
  });
  for(let i=14;i<27;i++)data.vehicles.push({
    id:'synthetic-v-'+i,rendszam:'TST-'+String(i+1).padStart(4,'0'),
    status:'aktiv'
  });
  const output=run(JSON.stringify(data),['--json']);
  assert.equal(output.status,2,output.stderr);
  const r=JSON.parse(output.stdout);
  assert.equal(r.sourcePreflightOk,true);
  assert.equal(r.operationallyReady,false);
  assert.ok(r.reasons.includes('PHASE1_ATOMIC_MIGRATION_READ_BOUND_EXCEEDED'));
  assert.equal(r.counts.drivers,30);
  assert.equal(r.counts.vehicles,27);
  assert.equal(r.counts.keyedPairs,57);
  assert.equal(r.counts.ownedReadDocuments,122);
  assert.equal(r.counts.withinAtomicReadBound,false);
  assert.equal(r.authorizedForImport,false);
});
test('source JSON duplicates and reserved sourceIndex never appear in stdout',()=>{
  const data=source();
  data.drivers[11].daCode=data.drivers[0].daCode;
  data.drivers[0].sourceIndex=0;
  const output=run(JSON.stringify(data),['--json']);
  assert.equal(output.status,2,output.stderr);
  const r=JSON.parse(output.stdout);
  assert.equal(r.sourcePreflightOk,false);
  assert.ok(r.reasons.includes('FULL_RICH_SOURCE_PREFLIGHT_DENIED'));
  assert.equal(r.untrustedLocalSourceSha256,null);
  assert.doesNotMatch(output.stdout,/DA0001|SECRET_DRIVER_CANARY|ABC-100/);
});
test('bad JSON, file errors and oversized input refuse without leaking paths or data',()=>{
  const invalid=run('PRIVATE_CANARY_NOT_VALID_JSON',['--json']);
  assert.equal(invalid.status,1);
  assert.deepEqual(JSON.parse(invalid.stdout).reasons,['INVALID_JSON_FILE']);
  assert.doesNotMatch(invalid.stdout+invalid.stderr,/PRIVATE_CANARY_NOT_VALID_JSON/);
  const oversized=run('x'.repeat(1_200_001),['--json']);
  assert.equal(oversized.status,1);
  assert.deepEqual(JSON.parse(oversized.stdout).reasons,['INPUT_FILE_EMPTY_OR_TOO_LARGE']);
  const bad=spawnSync(process.execPath,[script,'--input','/private/NOT_FOUND_SECRET_PATH','--json'],{
    cwd:resolve('.'),encoding:'utf8',timeout:10000
  });
  assert.equal(bad.status,1);
  assert.deepEqual(JSON.parse(bad.stdout).reasons,['INPUT_FILE_READ_FAILED']);
  assert.doesNotMatch(bad.stdout+bad.stderr,/NOT_FOUND_SECRET_PATH/);
});
test('invalid argument flags fail closed; tool never accepts source via command line',()=>{
  const res=spawnSync(process.execPath,[script,'--input','/tmp/source.json','--deploy','--json'],{
    cwd:resolve('.'),encoding:'utf8',timeout:10000
  });
  assert.equal(res.status,1);
  assert.deepEqual(JSON.parse(res.stdout).reasons,['INVALID_ARGUMENTS']);
});
test('pure helper returns only redacted counters and does not touch input',()=>{
  const raw=source(),before=JSON.stringify(raw);
  const r=assessPrivateFleetExport(raw);
  assert.equal(JSON.stringify(raw),before);
  assert.equal(r.counts.activeWithoutCapacity,6);
  assert.equal(JSON.stringify(r).includes('SECRET_CONTACT_CANARY'),false);
  assert.equal(r.readOnly,true);
});
