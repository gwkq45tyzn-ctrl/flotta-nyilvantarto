import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,rmSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {
  assessPrivateAppStateReadbacks,decodePrivateAppStateRow
} from './v1-private-appstate-double-readback.mjs';

const cli=resolve('tools/v1-private-appstate-double-readback.mjs');
const canaries=[
  'SYNTH_PRIVATE_DRIVER','SYNTH_PRIVATE_PHONE','SYNTH_PRIVATE_HISTORY',
  'SYNTH_PRIVATE_FUEL','SYNTH_PRIVATE_CONTACT','QA-991',
  'DA0001','SYNTH_PRIVATE_FILE_PATH'
];
const sample=()=>({
  vehicles:[{id:'vehicle-one',rendszam:'QA-991',status:'aktiv',km:37770,
    history:[{details:{secret:'SYNTH_PRIVATE_HISTORY'}}]}],
  drivers:[{id:'driver-one',daCode:'DA0001',status:'aktiv',
    name:'SYNTH_PRIVATE_DRIVER',phone:'SYNTH_PRIVATE_PHONE',
    history:[{nested:{preserve:true}}]}],
  fuelCards:[{id:'fuel-one',number:'SYNTH_PRIVATE_FUEL',history:[]}],
  contacts:[{id:'contact-one',name:'SYNTH_PRIVATE_CONTACT',nested:{keep:true}}],
  futureRoot:{nested:{key:'rich'}}
});
const row=(s,rev=42,time='2026-11-17T08:12:01.000Z')=>
  JSON.stringify([rev,time,JSON.stringify(s)]);
const tsv=(s,rev=42,time='2026-11-17T08:12:01.000Z')=>{
  const source=JSON.stringify(s);
  return rev+'\t'+time+'\t"'+source.replaceAll('"','""')+'"\r\n';
};
const redact=s=>{
  for(const canary of canaries)
    assert.equal(s.includes(canary),false,'Private canary leaked into output: '+canary);
};
const run=(one,two,saved,extra=[])=>{
  const dir=mkdtempSync(join(tmpdir(),'imile-local-private-row-check-'));
  try{
    const first=join(dir,'SYNTH_PRIVATE_FILE_PATH-first.tsv');
    const second=join(dir,'SYNTH_PRIVATE_FILE_PATH-second.tsv');
    const backup=join(dir,'SYNTH_PRIVATE_FILE_PATH-saved.json');
    for(const [path,value] of [[first,one],[second,two],[backup,saved]])
      writeFileSync(path,value,{mode:0o600});
    const before=[first,second,backup].map(p=>readFileSync(p,'utf8'));
    const cmd=spawnSync(process.execPath,[
      cli,'--first',first,'--second',second,'--saved',backup,...extra
    ],{cwd:resolve('.'),timeout:15000,encoding:'utf8'});
    assert.deepEqual([first,second,backup].map(p=>readFileSync(p,'utf8')),before,
      'CLI must NEVER modify any original or saved private input');
    redact(cmd.stdout+cmd.stderr);
    return cmd;
  }finally{rmSync(dir,{recursive:true,force:true});}
};
test('a double-read and byte exact separately saved file pass locally WITHOUT any production authority',()=>{
  const data=sample();
  const first=row(data),saved=JSON.stringify(data);
  const r=assessPrivateAppStateReadbacks(first,first,saved);
  assert.equal(r.localReadbackAndSavedBytesConsistent,true);
  assert.equal(r.revisionMatched,true);
  assert.equal(r.timestampMatched,true);
  assert.equal(r.sourceCellBytesMatched,true);
  assert.equal(r.savedExportBytesMatched,true);
  assert.equal(r.sourcePreflightOk,true);
  assert.equal(r.operationallyReady,false,'Missing active capacity is NOT silently defaulted');
  assert.equal(r.counts.activeWithoutCapacity,1);
  assert.equal(r.authorizedForImport,false);
  for(const key of ['actualSheetAuthorityVerified','freshLiveSourceVerified',
    'pendingBrowserWritesReconciled','independentlyPinnedBackupVerified',
    'restoredBackupVerified','actualLegacyWriterStopVerified',
    'productionIamVerified','productionReleaseApproved'])
    assert.equal(r[key],false,key+' cannot be inferred from self-provided files');
  redact(JSON.stringify(r));
  const cliRun=run(first,first,saved,['--json']);
  assert.equal(cliRun.status,0,cliRun.stderr);
  const output=JSON.parse(cliRun.stdout);
  assert.equal(output.localReadbackAndSavedBytesConsistent,true);
  assert.equal(output.operationallyReady,false);
});
test('realistic Google Sheets clipboard TSV quoted JSON accepts rich nested content',()=>{
  const data=sample(),r=tsv(data),saved=JSON.stringify(data);
  const parsed=decodePrivateAppStateRow(r);
  assert.deepEqual(parsed.source,data);
  assert.equal(parsed.revision,42);
  assert.equal(parsed.sourceText,saved);
  const out=run(r,r,saved,['--json']);
  assert.equal(out.status,0,out.stderr);
  assert.equal(JSON.parse(out.stdout).sourceCellBytesMatched,true);
});
test('normalized input row object also works for local manual capture',()=>{
  const s=JSON.stringify(sample());
  const input=JSON.stringify({revision:42,updatedAt:'2026-11-17T08:12:01.000Z',stateJson:s});
  const r=assessPrivateAppStateReadbacks(input,input,s);
  assert.equal(r.localReadbackAndSavedBytesConsistent,true);
});
test('source revision changed after first read is hard blocked even if C2 unchanged',()=>{
  const s=sample(),r=assessPrivateAppStateReadbacks(row(s,42),row(s,43),JSON.stringify(s));
  assert.equal(r.localReadbackAndSavedBytesConsistent,false);
  assert.equal(r.revisionMatched,false);
  assert.deepEqual(r.reasons,['REVISION_CHANGED_BETWEEN_READS']);
  assert.equal(r.authorizedForImport,false);
});
test('timestamp changed with same source and revision is hard blocked',()=>{
  const s=sample(),r=assessPrivateAppStateReadbacks(
    row(s,42,'2026-11-17T08:12:01.000Z'),
    row(s,42,'2026-11-17T08:12:09.000Z'),JSON.stringify(s));
  assert.ok(r.reasons.includes('TIMESTAMP_CHANGED_BETWEEN_READS'));
  assert.equal(r.localReadbackAndSavedBytesConsistent,false);
});
test('raw JSON nested rich changes with same revision/time cannot pass',()=>{
  const a=sample(),b=structuredClone(a);
  b.contacts[0].nested.keep=false;
  const result=assessPrivateAppStateReadbacks(row(a),row(b),JSON.stringify(a));
  assert.equal(result.localReadbackAndSavedBytesConsistent,false);
  assert.ok(result.reasons.includes('SOURCE_CELL_CHANGED_BETWEEN_READS'));
  assert.equal(result.sourceCellBytesMatched,false);
});
test('only re-saved, semantically identical JSON with extra whitespace fails byte-exact backup',()=>{
  const s=sample(),first=row(s);
  const saved=JSON.stringify(s,null,2);
  const r=assessPrivateAppStateReadbacks(first,first,saved);
  assert.equal(r.sourcePreflightOk,true);
  assert.equal(r.savedExportBytesMatched,false);
  assert.ok(r.reasons.includes('SAVED_SOURCE_NOT_BYTE_IDENTICAL'));
  const output=run(first,first,saved,['--json']);
  assert.equal(output.status,2);
  assert.equal(JSON.parse(output.stdout).savedExportBytesMatched,false);
});
test('invalid four rich arrays and malformed source fail without secret leakage',()=>{
  const first=row(sample());
  const wrong=sample();delete wrong.contacts;
  const res=assessPrivateAppStateReadbacks(row(wrong),row(wrong),JSON.stringify(wrong));
  assert.equal(res.sourcePreflightOk,false);
  assert.ok(res.reasons.includes('FULL_RICH_SOURCE_PREFLIGHT_DENIED'));
  const output=run('NOT_A_ROW',first,JSON.stringify(sample()),['--json']);
  assert.equal(output.status,2);
  assert.deepEqual(JSON.parse(output.stdout).reasons,['FIRST_APPSTATE_CAPTURE_INVALID']);
  const input=row(sample()).replace('SYNTH_PRIVATE_DRIVER','SYNTH_PRIVATE_DRIV3R');
  const mismatch=run(input,first,JSON.stringify(sample()),['--json']);
  assert.equal(mismatch.status,2);
  redact(mismatch.stdout+mismatch.stderr);
});
test('bad owner paths, unknown arguments, malformed Google TSV and symlink are denied',()=>{
  const s=sample(),r=row(s);
  const bad=run('42\t2026-11-17\t"{""broken"":true"',r,JSON.stringify(s),['--json']);
  assert.equal(bad.status,2);
  for(const tail of [['--deploy'],['--json','--json']]){
    const badArgs=run(r,r,JSON.stringify(s),tail);
    assert.equal(badArgs.status,1);
    redact(badArgs.stdout+badArgs.stderr);
  }
  const missing=spawnSync(process.execPath,[cli,'--first',
    '/SYNTH_PRIVATE_FILE_PATH','--second','/private/b','--saved','/private/c','--json'
  ],{cwd:resolve('.'),encoding:'utf8',timeout:10000});
  assert.equal(missing.status,1);
  redact(missing.stdout+missing.stderr);
  assert.deepEqual(JSON.parse(missing.stdout).reasons,
    ['FIRST_PRIVATE_FILE_UNREADABLE_OR_INVALID']);

  const dir=mkdtempSync(join(tmpdir(),'imile-owner-appstate-link-'));
  try{
    const raw=join(dir,'source.tsv'),link=join(dir,'link.tsv'),backup=join(dir,'saved.json');
    writeFileSync(raw,r,{mode:0o600});writeFileSync(backup,JSON.stringify(s),{mode:0o600});
    symlinkSync(raw,link);
    const res=spawnSync(process.execPath,[
      cli,'--first',link,'--second',raw,'--saved',backup,'--json'
    ],{cwd:resolve('.'),encoding:'utf8',timeout:10000});
    assert.equal(res.status,1);
    assert.deepEqual(JSON.parse(res.stdout).reasons,['FIRST_PRIVATE_FILE_UNREADABLE_OR_INVALID']);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
test('huge attacker-supplied TSV rejected at local read boundary',()=>{
  const s=sample(),r=row(s);
  const x=run('x'.repeat(1_200_001),r,JSON.stringify(s),['--json']);
  assert.equal(x.status,1);
  assert.deepEqual(JSON.parse(x.stdout).reasons,['FIRST_PRIVATE_FILE_UNREADABLE_OR_INVALID']);
});
