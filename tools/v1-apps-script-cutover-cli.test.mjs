import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {spawnSync} from 'node:child_process';

const cmd=resolve('tools/v1-apps-script-cutover-cli.mjs');
const fixture=()=>({
  schemaVersion:'imile-v1-local-legacy-cutover-1',
  capturedAt:new Date().toISOString(),
  ownerDeclaredComplete:true,
  coverage:{
    scriptProjects:true,deployedWebApps:true,staleBrowserClients:true,
    installedTriggers:true,timeDrivenTriggers:true,sheetDestinations:true,
    firebaseDestinations:true,urlFetchWriters:true
  },
  sourceSha256:'f'.repeat(64),
  principals:[{ref:'PRIVATE_PRINCIPAL_CANARY',identityReviewed:true}],
  destinations:[{ref:'PRIVATE_SHEET_CANARY',kind:'sheet',writeTargetReviewed:true}],
  projects:[{
    ref:'PRIVATE_SCRIPT_CANARY',ownerPrincipalRef:'PRIVATE_PRINCIPAL_CANARY',
    deployments:[{
      ref:'PRIVATE_WEBAPP_CANARY',enabled:false,mayWriteFleet:true,
      principalRef:'PRIVATE_PRINCIPAL_CANARY',
      destinationRefs:['PRIVATE_SHEET_CANARY'],versionReviewed:true
    }],
    triggers:[{
      ref:'PRIVATE_TRIGGER_CANARY',kind:'time-driven',enabled:false,
      mayWriteFleet:true,principalRef:'PRIVATE_PRINCIPAL_CANARY',
      destinationRefs:['PRIVATE_SHEET_CANARY']
    }],
    declaredNoDeployments:false,declaredNoTriggers:false
  }]
});
function runLocal(text,options=[]){
  const dir=mkdtempSync(join(tmpdir(),'imile-manifest-private-'));
  try{
    const path=join(dir,'PRIVATE_PATH_CANARY.json');
    writeFileSync(path,text,'utf8');
    const before=readFileSync(path,'utf8');
    const res=spawnSync(process.execPath,[cmd,'--input',path,...options],
      {encoding:'utf8',cwd:resolve('.'),timeout:15000});
    assert.equal(readFileSync(path,'utf8'),before,'must never mutate input');
    return res;
  }finally{rmSync(dir,{recursive:true,force:true})}
}
function redacted(res){
  for(const s of ['PRIVATE_SCRIPT_CANARY','PRIVATE_PRINCIPAL_CANARY',
    'PRIVATE_TRIGGER_CANARY','PRIVATE_WEBAPP_CANARY',
    'PRIVATE_SHEET_CANARY','PRIVATE_PATH_CANARY']){
    assert.ok(!(res.stdout+res.stderr).includes(s),'Leaked private field '+s);
  }
}
test('read-only locally complete inventory does not claim authenticated Google access',()=>{
  const res=runLocal(JSON.stringify(fixture()),['--json']);
  assert.equal(res.status,0,res.stderr);
  const obj=JSON.parse(res.stdout);
  assert.equal(obj.locallyComplete,true);
  assert.equal(obj.noActiveFleetWriterClaimed,true);
  assert.equal(obj.liveDeploymentVerified,false);
  assert.equal(obj.ownerEvidenceAuthenticated,false);
  assert.equal(obj.productionCutoverAuthorized,false);
  assert.equal(obj.authorizedForImport,false);
  assert.equal(obj.readOnly,true);
  assert.equal(obj.counts.projects,1);
  assert.equal(obj.counts.deployments,1);
  assert.equal(obj.counts.triggers,1);
  redacted(res);
});
test('active time-driven writer is blocked, never accepted as cutover evidence',()=>{
  const src=fixture();src.projects[0].triggers[0].enabled=true;
  const res=runLocal(JSON.stringify(src));
  assert.equal(res.status,2,res.stdout);
  assert.match(res.stdout,/ACTIVE_LEGACY_FLEET_WRITER/);
  assert.match(res.stdout,/TILTVA/);
  redacted(res);
});
test('unknown principal and stale manifest fail without leaking owner source',()=>{
  const src=fixture();src.capturedAt='2020-01-01T00:00:00.000Z';
  src.projects[0].deployments[0].principalRef='PRIVATE_UNKNOWN_CANARY';
  const res=runLocal(JSON.stringify(src),['--json']);
  assert.equal(res.status,2);
  assert.ok(JSON.parse(res.stdout).reasons.includes('OWNER_SNAPSHOT_STALE_OR_INVALID'));
  assert.ok(JSON.parse(res.stdout).reasons.includes('UNKNOWN_EXECUTION_PRINCIPAL'));
  redacted(res);
  assert.ok(!(res.stdout+res.stderr).includes('PRIVATE_UNKNOWN_CANARY'));
});
test('bad JSON, file path, oversized content and argument injection never print input',()=>{
  const bad=runLocal('PRIVATE_SCRIPT_CANARY INVALID JSON',['--json']);
  assert.equal(bad.status,1);
  assert.deepEqual(JSON.parse(bad.stdout).reasons,['INVALID_MANIFEST_JSON']);
  redacted(bad);
  const large=runLocal('x'.repeat(256*1024+1),['--json']);
  assert.equal(large.status,1);
  assert.deepEqual(JSON.parse(large.stdout).reasons,['EMPTY_OR_OVERSIZE_MANIFEST']);
  redacted(large);
  const args=spawnSync(process.execPath,[cmd,'--input','/PRIVATE_PATH_CANARY','--deploy','--json'],
    {cwd:resolve('.'),encoding:'utf8',timeout:10000});
  assert.equal(args.status,1);
  assert.deepEqual(JSON.parse(args.stdout).reasons,['INVALID_ARGUMENTS']);
  redacted(args);
});
