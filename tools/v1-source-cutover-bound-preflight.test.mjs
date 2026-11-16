import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,rmSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {sha256} from './v1-migration-dryrun.mjs';
import {assessSourceAndLegacyCutover} from './v1-source-cutover-bound-preflight.mjs';

const cli=resolve('tools/v1-source-cutover-bound-preflight.mjs');
const privateMarkers=[
  'PRIVATE_DRIVER_NAME_CANARY','PRIVATE_PHONE_CANARY','PRIVATE_HISTORY_CANARY',
  'PRIVATE_CARD_CANARY','PRIVATE_CONTACT_CANARY','PRIVATE_SCRIPT_REF_CANARY',
  'PRIVATE_TRIGGER_REF_CANARY','PRIVATE_PRINCIPAL_REF_CANARY',
  'PRIVATE_SHEET_REF_CANARY','PRIVATE_FILE_PATH_CANARY',
  'DA-0001','ABC-123'
];
const fleet=()=>({
  drivers:[
    {id:'driver-1',daCode:'DA-0001',name:'PRIVATE_DRIVER_NAME_CANARY',
      phone:'PRIVATE_PHONE_CANARY',status:'aktiv',kapacitas:70,
      history:[{event:'PRIVATE_HISTORY_CANARY'}]},
    {id:'driver-2',daCode:'DA-0002',status:'aktiv',kapacitas:70}
  ],
  vehicles:[
    {id:'vehicle-1',rendszam:'ABC-123',status:'aktiv',km:37891,
      history:[{event:'private-service-history'}]},
    {id:'vehicle-2',rendszam:'DEF-456',status:'aktiv'}
  ],
  fuelCards:[{id:'fuel-1',number:'PRIVATE_CARD_CANARY'}],
  contacts:[{id:'contact-1',name:'PRIVATE_CONTACT_CANARY'}],
  richExtra:{history:[{note:'PRIVATE_HISTORY_CANARY'}]}
});
const inventory=(source,now=Date.now())=>({
  schemaVersion:'imile-v1-local-legacy-cutover-1',
  capturedAt:new Date(now).toISOString(),
  ownerDeclaredComplete:true,
  sourceSha256:sha256(source),
  coverage:{
    scriptProjects:true,deployedWebApps:true,staleBrowserClients:true,
    installedTriggers:true,timeDrivenTriggers:true,sheetDestinations:true,
    firebaseDestinations:true,urlFetchWriters:true
  },
  principals:[{ref:'PRIVATE_PRINCIPAL_REF_CANARY',identityReviewed:true}],
  destinations:[{
    ref:'PRIVATE_SHEET_REF_CANARY',kind:'sheet',writeTargetReviewed:true
  }],
  projects:[{
    ref:'PRIVATE_SCRIPT_REF_CANARY',ownerPrincipalRef:'PRIVATE_PRINCIPAL_REF_CANARY',
    declaredNoDeployments:false,declaredNoTriggers:false,
    deployments:[{
      ref:'PRIVATE_DEPLOYMENT_REF_CANARY',enabled:false,mayWriteFleet:true,
      principalRef:'PRIVATE_PRINCIPAL_REF_CANARY',
      destinationRefs:['PRIVATE_SHEET_REF_CANARY'],versionReviewed:true
    }],
    triggers:[{
      ref:'PRIVATE_TRIGGER_REF_CANARY',kind:'time-driven',enabled:false,
      mayWriteFleet:true,principalRef:'PRIVATE_PRINCIPAL_REF_CANARY',
      destinationRefs:['PRIVATE_SHEET_REF_CANARY']
    }]
  }]
});
const assertRedacted=output=>{
  for(const secret of privateMarkers)assert.ok(!output.includes(secret),
    'Private content leaked: '+secret);
  assert.ok(!output.includes('PRIVATE_DEPLOYMENT_REF_CANARY'));
};
const localRun=(source,manifest,extraFlags=['--json'])=>{
  const dir=mkdtempSync(join(tmpdir(),'imile-private-source-cutover-'));
  try{
    const sourcePath=join(dir,'PRIVATE_FILE_PATH_CANARY-fleet.json');
    const manifestPath=join(dir,'PRIVATE_FILE_PATH_CANARY-writers.json');
    const s=JSON.stringify(source),m=JSON.stringify(manifest);
    writeFileSync(sourcePath,s,{mode:0o600});
    writeFileSync(manifestPath,m,{mode:0o600});
    const output=spawnSync(process.execPath,[
      cli,'--fleet',sourcePath,'--legacy-writers',manifestPath,...extraFlags
    ],{encoding:'utf8',cwd:resolve('.'),timeout:15000});
    assert.equal(readFileSync(sourcePath,'utf8'),s,'Fleet source must stay byte-identical');
    assert.equal(readFileSync(manifestPath,'utf8'),m,'Owner manifest must stay byte-identical');
    assertRedacted(output.stdout+output.stderr);
    return output;
  }finally{rmSync(dir,{recursive:true,force:true});}
};
test('matching complete LOCAL owner files may pass but NEVER grant production GO',()=>{
  const s=fleet(),m=inventory(s,Date.parse('2026-11-16T10:00:00Z'));
  const before=JSON.stringify([s,m]);
  const a=assessSourceAndLegacyCutover(s,m,{now:Date.parse('2026-11-16T10:00:00Z')});
  assert.equal(JSON.stringify([s,m]),before,'Pure local check must not mutate owner inputs');
  assert.equal(a.locallyBoundAndReady,true);
  assert.equal(a.crossEvidenceSha256Matched,true);
  assert.deepEqual(a.reasons,[]);
  assert.equal(a.source.operationallyReady,true);
  assert.equal(a.legacyWriters.locallyComplete,true);
  for(const key of ['independentlyPinnedSource','ownerInventoryAuthenticated',
    'actualDeploymentsVerified','productionIamVerified',
    'localFirestoreProtoSizeVerified','productionFirestoreSizeVerified',
    'ownerReleaseApproved','productionReleaseAuthorized','authorizedForImport'])
    assert.equal(a[key],false,'No false GO flag: '+key);
  assert.equal(a.readOnly,true);
  assertRedacted(JSON.stringify(a));
});
test('mismatched SOURCE digest refuses two individually valid reports',()=>{
  const original=fleet(),tampered=structuredClone(original);
  tampered.fuelCards[0].number='changed-without-owner-new-cutover-review';
  const m=inventory(original),a=assessSourceAndLegacyCutover(tampered,m);
  assert.equal(a.source.operationallyReady,true);
  assert.equal(a.legacyWriters.locallyComplete,true);
  assert.equal(a.crossEvidenceSha256Matched,false);
  assert.ok(a.reasons.includes('SOURCE_MANIFEST_SHA256_MISMATCH'));
  assert.equal(a.locallyBoundAndReady,false);
  const cliResult=localRun(tampered,m);
  assert.equal(cliResult.status,2,cliResult.stderr);
  assert.ok(JSON.parse(cliResult.stdout).reasons.includes('SOURCE_MANIFEST_SHA256_MISMATCH'));
});
test('closed/unknown and absent digest never create a false source match',()=>{
  const s=fleet(),m=inventory(s);m.sourceSha256=null;
  const r=assessSourceAndLegacyCutover(s,m);
  assert.equal(r.crossEvidenceSha256Matched,false);
  assert.ok(r.reasons.includes('SOURCE_MANIFEST_DIGEST_NOT_COMPARABLE'));
  assert.ok(r.reasons.includes('LEGACY_WRITER_LOCAL_INVENTORY_DENIED'));
  assert.equal(r.authorizedForImport,false);
});
test('active Google legacy writer blocks even if source digest matches',()=>{
  const s=fleet(),m=inventory(s);
  m.projects[0].triggers[0].enabled=true;
  const r=assessSourceAndLegacyCutover(s,m);
  assert.equal(r.crossEvidenceSha256Matched,true);
  assert.equal(r.locallyBoundAndReady,false);
  assert.ok(r.reasons.includes('LEGACY_WRITER_LOCAL_INVENTORY_DENIED'));
  assert.ok(r.legacyWriters.reasons.includes('ACTIVE_LEGACY_FLEET_WRITER'));
  assert.equal(localRun(s,m).status,2);
});
test('sourceIndex poisoning cannot be hidden with a matching forged self-declared hash',()=>{
  const s=fleet();s.drivers[0].sourceIndex=0;
  const m=inventory(s),r=assessSourceAndLegacyCutover(s,m);
  assert.equal(r.locallyBoundAndReady,false);
  assert.equal(r.crossEvidenceSha256Matched,false);
  assert.ok(r.reasons.includes('FLEET_RICH_SOURCE_PREFLIGHT_DENIED'));
  assert.ok(r.reasons.includes('SOURCE_MANIFEST_DIGEST_NOT_COMPARABLE'));
  assert.equal(r.source.sourcePreflightOk,false);
  assert.equal(localRun(s,m).status,2);
});
test('missing active driver capacity blocks even when source hash and cutover match',()=>{
  const s=fleet();delete s.drivers[0].kapacitas;
  const m=inventory(s),r=assessSourceAndLegacyCutover(s,m);
  assert.equal(r.crossEvidenceSha256Matched,true);
  assert.equal(r.locallyBoundAndReady,false);
  assert.ok(r.source.reasons.includes('ACTIVE_DRIVER_CAPACITY_UNSET_OR_INVALID'));
  assert.ok(r.reasons.includes('FLEET_OPERATIONAL_PREFLIGHT_DENIED'));
});
test('read-only CLI locally matching JSON yields 0, still blocked production',()=>{
  const s=fleet(),m=inventory(s),r=localRun(s,m);
  assert.equal(r.status,0,r.stderr);
  const parsed=JSON.parse(r.stdout);
  assert.equal(parsed.crossEvidenceSha256Matched,true);
  assert.equal(parsed.authorizedForImport,false);
  assert.equal(parsed.productionReleaseAuthorized,false);
  assert.equal(parsed.ownerReleaseApproved,false);
  const human=localRun(s,m,[]);
  assert.equal(human.status,0);
  assert.match(human.stdout,/ÉLESÍTÉS TILOS/);
  assertRedacted(human.stdout+human.stderr);
});
test('malformed files and bad arguments fail closed without printing private paths',()=>{
  const s=fleet(),m=inventory(s);
  const bad=localRun(s,'{invalid-json');
  assert.equal(bad.status,1);
  assert.deepEqual(JSON.parse(bad.stdout).reasons,['LEGACY_PRIVATE_FILE_UNREADABLE_OR_INVALID']);
  const missing=spawnSync(process.execPath,[cli,'--fleet','/PRIVATE_FILE_PATH_CANARY','--legacy-writers','/also-private','--json'],{
    encoding:'utf8',timeout:10000,cwd:resolve('.')
  });
  assert.equal(missing.status,1);
  assertRedacted(missing.stdout+missing.stderr);
  assert.deepEqual(JSON.parse(missing.stdout).reasons,['FLEET_PRIVATE_FILE_UNREADABLE_OR_INVALID']);
  for(const extra of [['--deploy'],['--fleet'],['--fleet','/private'],['--json','--json']]){
    const run=spawnSync(process.execPath,[cli,...extra],{encoding:'utf8',timeout:10000,cwd:resolve('.')});
    assert.equal(run.status,1);
    assertRedacted(run.stdout+run.stderr);
  }
  const oversized=localRun('x'.repeat(1_200_001),m);
  assert.equal(oversized.status,1);
  assert.deepEqual(JSON.parse(oversized.stdout).reasons,['FLEET_PRIVATE_FILE_UNREADABLE_OR_INVALID']);
});
test('private input symlink refused instead of following unreviewed file',()=>{
  const dir=mkdtempSync(join(tmpdir(),'imile-owner-symlink-check-'));
  try{
    const valid=join(dir,'real.json'),link=join(dir,'sym.json'),manifestPath=join(dir,'manifest.json');
    const s=fleet();
    writeFileSync(valid,JSON.stringify(s),{mode:0o600});
    symlinkSync(valid,link);
    writeFileSync(manifestPath,JSON.stringify(inventory(s)),{mode:0o600});
    const result=spawnSync(process.execPath,[
      cli,'--fleet',link,'--legacy-writers',manifestPath,'--json'
    ],{encoding:'utf8',timeout:10000,cwd:resolve('.')});
    assert.equal(result.status,1);
    assert.deepEqual(JSON.parse(result.stdout).reasons,['FLEET_PRIVATE_FILE_UNREADABLE_OR_INVALID']);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
