/**
 * CLI privacy regression: keep granular trusted pure-function diagnostics,
 * but NEVER expose private DA/plate IDs, source fields, paths, parser errors
 * or nested history from the user-facing command or failed output artifacts.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {preflight} from './v1-migration-dryrun.mjs';

const script=resolve('tools/v1-migration-dryrun.mjs');
const secrets=['PRIVATE_DRIVER_CANARY','PRIVATE_PHONE_CANARY','PRIVATE_DA_CANARY',
  'SECRETDA001','PRIVATE_PLATE_CANARY','PRIVATE_HISTORY_CANARY',
  'PRIVATE_FILE_PATH_CANARY','PRIVATE_CONTACT_CANARY','PRIVATE_BAD_JSON_CANARY'];
const src=()=>({
  drivers:[{id:'d1',daCode:'SECRETDA001',status:'aktiv',kapacitas:70,
    name:'PRIVATE_DRIVER_CANARY',phone:'PRIVATE_PHONE_CANARY',
    history:[{private:'PRIVATE_HISTORY_CANARY'}]},
    {id:'d2',daCode:'SECRETDA002',status:'aktiv',kapacitas:80}],
  vehicles:[{id:'v1',rendszam:'PRIVATE-PLATE-001',status:'aktiv',
    history:[{private:'PRIVATE_HISTORY_CANARY'}]}],
  fuelCards:[{id:'f',history:[]}],
  contacts:[{id:'c',name:'PRIVATE_CONTACT_CANARY'}]
});
function noLeak(output){
  for(const secret of secrets)
    assert.equal(output.includes(secret),false,'CLI leaked '+secret);
}
function withInput(payload,operation,args=[]){
  const dir=mkdtempSync(join(tmpdir(),'imile-PRIVATE_FILE_PATH_CANARY-'));
  try{
    const input=join(dir,'PRIVATE_FILE_PATH_CANARY-source.json');
    const output=join(dir,'PRIVATE_FILE_PATH_CANARY-result.json');
    writeFileSync(input,typeof payload==='string'?payload:JSON.stringify(payload),{mode:0o600});
    const r=spawnSync(process.execPath,[script,operation,'--input',input,...args],
      {cwd:resolve('.'),encoding:'utf8',timeout:15000});
    noLeak(r.stdout+r.stderr);
    return {r,output,dir};
  }finally{rmSync(dir,{recursive:true,force:true});}
}
test('pure diagnostic still diagnoses duplicate normalized DA, without changing migration security contract',()=>{
  const input=src();input.drivers[1].daCode='secretDA001';
  const p=preflight(input);
  assert.equal(p.ok,false);
  assert.match(p.errors.join(' '),/Duplicate DA SECRETDA001/);
});
test('failed private preflight prints only safe error code (no duplicate DA or path)',()=>{
  const input=src();input.drivers[1].daCode='secretDA001';
  const {r}=withInput(input,'preflight');
  assert.equal(r.status,2,r.stderr);
  const output=JSON.parse(r.stdout);
  assert.deepEqual(output.errors,['PRIVATE_SOURCE_PREFLIGHT_DENIED']);
  assert.equal(output.authorizedForImport,false);
  assert.equal(output.ok,false);
});
test('invalid private plate and unknown history are not leaked to CLI',()=>{
  const input=src();
  input.vehicles.push({id:'v2',rendszam:'private plate 001',history:[
    {private:'PRIVATE_HISTORY_CANARY'}]});
  const {r}=withInput(input,'preflight');
  assert.equal(r.status,2);
  assert.deepEqual(JSON.parse(r.stdout).errors,['PRIVATE_SOURCE_PREFLIGHT_DENIED']);
});
test('malformed private JSON and unknown flags never print parser fragments or paths',()=>{
  const input='{"drivers":[PRIVATE_BAD_JSON_CANARY, PRIVATE_DRIVER_CANARY';
  for(const [op,args] of [
    ['preflight',[]],['dry-run',[]],['preflight',['--deploy','SECRETDA001']]
  ]){
    const {r}=withInput(input,op,args);
    assert.equal(r.status,2);
    assert.equal(r.stdout,'');
    assert.match(r.stderr,/PRIVATE_INPUT_OR_ARGUMENTS_DENIED/);
  }
});
test('failed preflight --output produces redacted private file, never raw duplicate ID',()=>{
  const dir=mkdtempSync(join(tmpdir(),'imile-private-failed-output-'));
  try{
    const input=src();input.drivers[1].daCode=input.drivers[0].daCode;
    const a=join(dir,'PRIVATE_FILE_PATH_CANARY-input.json');
    const o=join(dir,'PRIVATE_FILE_PATH_CANARY-out.json');
    writeFileSync(a,JSON.stringify(input),{mode:0o600});
    const r=spawnSync(process.execPath,[script,'preflight','--input',a,
      '--output',o],{cwd:resolve('.'),encoding:'utf8',timeout:15000});
    assert.equal(r.status,2,r.stderr);noLeak(r.stdout+r.stderr);
    const content=readFileSync(o,'utf8');noLeak(content);
    assert.deepEqual(JSON.parse(content).errors,['PRIVATE_SOURCE_PREFLIGHT_DENIED']);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
test('valid local preflight and dry-run still work, output never authorizes import',()=>{
  const dir=mkdtempSync(join(tmpdir(),'imile-private-valid-'));
  try{
    const a=join(dir,'PRIVATE_FILE_PATH_CANARY-source.json');
    writeFileSync(a,JSON.stringify(src()),{mode:0o600});
    for(const op of ['preflight','dry-run']){
      const r=spawnSync(process.execPath,[script,op,'--input',a],
        {cwd:resolve('.'),encoding:'utf8',timeout:15000});
      assert.equal(r.status,0,r.stderr);noLeak(r.stdout+r.stderr);
      const result=JSON.parse(r.stdout);
      assert.equal(result.authorizedForImport,false);
      assert.equal(result.errors,null);
    }
  }finally{rmSync(dir,{recursive:true,force:true});}
});
