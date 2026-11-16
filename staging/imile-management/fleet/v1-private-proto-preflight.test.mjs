import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {
  measurePrivateRichFleetSource as measure,runPrivateProtoPreflight
} from './v1-private-proto-preflight.mjs';
import {syntheticFourBlockSource,projectBlockPairs}
  from '../../../tools/v1-variable-block-migration.mjs';
import {MAX_DOCUMENT_PROTO_BYTES} from './v1-firestore-wire-size.mjs';
import {sha256} from '../../../tools/v1-migration-dryrun.mjs';

const original=()=>syntheticFourBlockSource({
  drivers:12,vehicles:14,fuelCards:14,contacts:5
});
const cli=resolve('staging/imile-management/fleet/v1-private-proto-preflight.mjs');
function run(text,flags=['--json']){
  const tmp=mkdtempSync(join(tmpdir(),'imile-proto-private-'));
  try{
    const file=join(tmp,'PRIVATE_PATH_CANARY.json');
    writeFileSync(file,text,'utf8');
    return spawnSync(process.execPath,[cli,'--input',file,...flags],{
      cwd:resolve('.'),encoding:'utf8',timeout:30000
    });
  }finally{rmSync(tmp,{recursive:true,force:true});}
}

test('actual Firebase SDK protobuf measures original rich archive and every projected master/claim locally',()=>{
  const raw=original(),before=JSON.stringify(raw),projected=projectBlockPairs(raw);
  const result=measure(raw);
  assert.equal(result.ok,true,JSON.stringify(result));
  assert.equal(result.locallySized,true);
  assert.equal(result.localSdkProtoEncodedSizeVerified,true);
  assert.equal(result.sourceDocumentProtoBytes>0,true);
  assert.equal(result.maxMasterDocumentProtoBytes>0,true);
  assert.equal(result.maxClaimDocumentProtoBytes>0,true);
  assert.equal(result.measuredDocuments,1+2*projected.pairs.length);
  assert.equal(result.measuredDocuments,53);
  assert.equal(result.localDocumentProtoLimitBytes,MAX_DOCUMENT_PROTO_BYTES);
  assert.equal(result.localSourceSha256,sha256(raw));
  assert.equal(result.operationallyReady,true);
  assert.equal(result.authorizedForImport,false);
  assert.equal(result.productionSourceAttested,false);
  assert.equal(result.productionIamVerified,false);
  assert.equal(result.productionFirestoreEncodedSizeVerified,false);
  assert.equal(result.liveFirestoreMeasured,false);
  assert.equal(result.ownerApprovalVerified,false);
  assert.equal(JSON.stringify(raw),before,'source data must never be changed');
  assert.equal(JSON.stringify(result).includes('SYNTHETIC COURIER'),false);
});

test('large 440-pair source CAN be measured offline while operational and trusted import remain blocked',()=>{
  const raw=syntheticFourBlockSource({
    drivers:220,vehicles:220,fuelCards:22,contacts:7
  });
  const result=measure(raw);
  assert.equal(result.ok,true,JSON.stringify(result));
  assert.equal(result.measuredDocuments,881);
  assert.equal(result.counts.keyedPairs,440);
  assert.equal(result.operationallyReady,false);
  assert.ok(result.operationalReasons.includes('PHASE1_RULES_DRIVER_LIMIT_EXCEEDED'));
  assert.equal(result.productionFirestoreEncodedSizeVerified,false);
  assert.equal(result.authorizedForImport,false);
});

test('real protobuf size measurement never masks 57-pair atomic migration NO-GO',()=>{
  const source=syntheticFourBlockSource({
    drivers:30,vehicles:27,fuelCards:3,contacts:2
  });
  const result=measure(source);
  assert.equal(result.ok,true);
  assert.equal(result.measuredDocuments,115);
  assert.equal(result.counts.keyedPairs,57);
  assert.equal(result.operationallyReady,false);
  assert.ok(result.operationalReasons.includes(
    'PHASE1_ATOMIC_MIGRATION_READ_BOUND_EXCEEDED'));
  assert.equal(result.authorizedForImport,false);
  assert.equal(result.productionFirestoreEncodedSizeVerified,false);
});
test('hostile rich source and metadata collision fail closed with static no-PII reason',()=>{
  const hostile=[
    ['sealed',()=>({...original(),sealed:true})],
    ['fake attestation',()=>({...original(),migrationSourceSha256:'a'.repeat(64)})],
    ['revision spoof',()=>({...original(),revision:999})],
    ['duplicate DA',()=>{const x=original();x.drivers[1].daCode=' da0001 ';return x;}],
    ['fake sourceIndex',()=>{const x=original();x.drivers[0].sourceIndex=0;return x;}],
    ['nested array',()=>{const x=original();x.vehicles[0].history=[[1]];return x;}],
    ['unsupported value',()=>{const x=original();x.contacts[0].history=[{v:undefined}];return x;}],
    ['giant JSON',()=>({...original(),notes:'SENSITIVE_PRIVATE_CANARY'.repeat(100000)})]
  ];
  for(const [name,build] of hostile){
    const value=measure(build());
    assert.equal(value.ok,false,name);
    assert.equal(value.authorizedForImport,false,name);
    assert.equal(value.localSdkProtoEncodedSizeVerified,false,name);
    assert.equal(value.localSourceSha256,null,name);
    assert.equal(value.counts,null,name);
    assert.doesNotMatch(JSON.stringify(value),/PRIVATE_CANARY|da0001|SYNTHETIC COURIER/,name);
  }
});

test('private owner CLI returns redacted exact SDK measurement and refuses cloud release flags',()=>{
  const raw=original();
  raw.drivers[0].name='SENSITIVE_PRIVATE_NAME_CANARY';
  raw.contacts[0].name='SENSITIVE_PRIVATE_CONTACT_CANARY';
  const completed=run(JSON.stringify(raw));
  assert.equal(completed.status,0,completed.stderr);
  const result=JSON.parse(completed.stdout);
  assert.equal(result.locallySized,true);
  assert.equal(result.measuredDocuments,53);
  assert.equal(result.authorizedForImport,false);
  assert.equal(result.readOnly,true);
  for(const secret of ['SENSITIVE_PRIVATE_NAME_CANARY','SENSITIVE_PRIVATE_CONTACT_CANARY',
    'PRIVATE_PATH_CANARY','SYNTHETIC COURIER','TST-0001','DA0001']){
    assert.equal((completed.stdout+completed.stderr).includes(secret),false,
      'private data or path must not appear: '+secret);
  }
  const denied=run(JSON.stringify(raw),['--deploy','--json']);
  assert.equal(denied.status,1);
  assert.deepEqual(JSON.parse(denied.stdout).reason,'INVALID_ARGUMENTS');
  assert.equal(denied.stderr,'');
});
test('unreadable, malformed or oversized owner file fails closed, no path or PII',()=>{
  const malformed=run('SENSITIVE_PRIVATE_PARSE_CANARY{');
  assert.equal(malformed.status,1);
  assert.equal(JSON.parse(malformed.stdout).reason,
    'SOURCE_FILE_UNREADABLE_OR_INVALID_JSON');
  assert.doesNotMatch(malformed.stdout+malformed.stderr,/PRIVATE_PARSE_CANARY|PRIVATE_PATH_CANARY/);
  const large=run('x'.repeat(1200001));
  assert.equal(large.status,1);
  assert.equal(JSON.parse(large.stdout).reason,'SOURCE_FILE_EMPTY_OR_TOO_LARGE');
  const absent=spawnSync(process.execPath,[cli,'--input',
    '/not-here-PRIVATE_SOURCE_PATH_CANARY','--json'],{
      encoding:'utf8',cwd:resolve('.'),timeout:30000
    });
  assert.equal(absent.status,1);
  assert.doesNotMatch(absent.stdout+absent.stderr,/PRIVATE_SOURCE_PATH_CANARY/);
});

test('stricter normalized-identity duplicate source rejects even if small',()=>{
  const raw=original();
  raw.drivers[0].daCode='DA-test';
  raw.drivers[1].daCode='da-TEST';
  const result=measure(raw);
  assert.equal(result.ok,false);
  assert.equal(result.reason,'SOURCE_PREFLIGHT_OR_ADVISORY_DENIED');
  assert.equal(result.measuredDocuments,0);
  assert.equal(result.authorizedForImport,false);
});
