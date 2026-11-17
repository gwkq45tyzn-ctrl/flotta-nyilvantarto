import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,symlinkSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';

const root=resolve('.');
const appstate=resolve('tools/v1-private-appstate-double-readback.mjs');
const transition=resolve('tools/v1-private-capacity-transition.mjs');
const cutover=resolve('tools/v1-source-cutover-bound-preflight.mjs');
const privateNames=['PRIVATE_DRIVER_NAME_CANARY','PRIVATE_PHONE_CANARY',
  'PRIVATE_CONTACT_CANARY','PRIVATE_SOURCE_PATH_CANARY','QA0001','ABC-123'];
const src=()=>({
  drivers:[{id:'d1',daCode:'QA0001',status:'aktiv',kapacitas:70,
    name:'PRIVATE_DRIVER_NAME_CANARY',phone:'PRIVATE_PHONE_CANARY',history:[{deep:['keep']}] }],
  vehicles:[{id:'v1',rendszam:'ABC-123',status:'aktiv',history:[{deep:{keep:true}}]}],
  fuelCards:[],contacts:[{id:'c1',name:'PRIVATE_CONTACT_CANARY'}]
});
const setup=()=> {
  const folder=mkdtempSync(join(tmpdir(),'imile-private-reader-'));
  const source=src();
  const files={
    first:join(folder,'PRIVATE_SOURCE_PATH_CANARY-first.tsv'),
    second:join(folder,'PRIVATE_SOURCE_PATH_CANARY-second.tsv'),
    original:join(folder,'PRIVATE_SOURCE_PATH_CANARY-original.json'),
    candidate:join(folder,'PRIVATE_SOURCE_PATH_CANARY-candidate.json'),
    decisions:join(folder,'PRIVATE_SOURCE_PATH_CANARY-decisions.json'),
    writers:join(folder,'PRIVATE_SOURCE_PATH_CANARY-legacy.json'),
    malformed:join(folder,'PRIVATE_SOURCE_PATH_CANARY-malformed.json'),
    symlink:join(folder,'PRIVATE_SOURCE_PATH_CANARY-symbolic.json')
  };
  const row=JSON.stringify([7,'2026-11-17T10:00:00.000Z',JSON.stringify(source)]);
  for(const [name,value] of Object.entries({
    first:row,second:row,
    original:JSON.stringify(source),candidate:JSON.stringify(source),
    decisions:JSON.stringify([{daCode:'QA0001',kapacitas:70,reviewed:true}]),
    writers:'{}'
  }))writeFileSync(files[name],value,{mode:0o600});
  writeFileSync(files.malformed,Buffer.from([123,34,120,34,58,34,0x80,34,125]),
    {mode:0o600});
  symlinkSync(files.original,files.symlink);
  return {folder,files};
};
function cli(script,args){
  const r=spawnSync(process.execPath,[script,...args,'--json'],
    {cwd:root,timeout:15000,encoding:'utf8'});
  for(const marker of privateNames)
    assert.equal((r.stdout+r.stderr).includes(marker),false,'private marker leaked');
  assert.equal(r.status,1,r.stderr);
  return JSON.parse(r.stdout);
}
test('private double-readback rejects swapped symlink source even if saved JSON is otherwise valid',()=>{
  const {folder,files}=setup();
  try{
    const r=cli(appstate,['--first',files.symlink,'--second',files.second,
      '--saved',files.original]);
    assert.deepEqual(r.reasons,['FIRST_PRIVATE_FILE_UNREADABLE_OR_INVALID']);
    assert.equal(r.authorizedForImport,false);
  }finally{rmSync(folder,{force:true,recursive:true});}
});
test('private capacity transition refuses symlinked candidate; no implicit release',()=>{
  const {folder,files}=setup();
  try{
    const r=cli(transition,['--first',files.first,'--second',files.second,
      '--original',files.original,'--candidate',files.symlink,
      '--decisions',files.decisions]);
    assert.deepEqual(r.reasons,['CANDIDATETEXT_PRIVATE_FILE_UNREADABLE']);
    assert.equal(r.authorizedForImport,false);
  }finally{rmSync(folder,{force:true,recursive:true});}
});
test('source-cutover digest CLI rejects symlinked original source and malformed UTF-8 writer inventory',()=>{
  const {folder,files}=setup();
  try{
    const r=cli(cutover,['--fleet',files.symlink,'--legacy-writers',files.writers]);
    assert.deepEqual(r.reasons,['FLEET_PRIVATE_FILE_UNREADABLE_OR_INVALID']);
    const b=cli(cutover,['--fleet',files.original,
      '--legacy-writers',files.malformed]);
    assert.deepEqual(b.reasons,['LEGACY_PRIVATE_FILE_UNREADABLE_OR_INVALID']);
    assert.equal(b.productionReleaseAuthorized,false);
    assert.equal(b.actualDeploymentsVerified,false);
  }finally{rmSync(folder,{force:true,recursive:true});}
});
test('private capacity decisions corrupted UTF-8 never become approved',()=>{
  const {folder,files}=setup();
  try{
    const r=cli(transition,['--first',files.first,'--second',files.second,
      '--original',files.original,'--candidate',files.candidate,
      '--decisions',files.malformed]);
    assert.deepEqual(r.reasons,['DECISIONSTEXT_PRIVATE_FILE_UNREADABLE']);
    assert.equal(r.locallyProvenOnlyReviewedCapacitiesChanged,false);
  }finally{rmSync(folder,{force:true,recursive:true});}
});
