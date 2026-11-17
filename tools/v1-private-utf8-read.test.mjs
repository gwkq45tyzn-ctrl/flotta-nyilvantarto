import test from 'node:test';
import fs from 'node:fs';
import {syncBuiltinESMExports} from 'node:module';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,symlinkSync,rmSync,statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {readStrictPrivateUtf8File} from './v1-private-utf8-read.mjs';

const privateCanary='PRIVATE_SOURCE_PATH_CANARY';
const forbidden=[privateCanary,'PRIVATE_CONTACT_CANARY','PRIVATE_DA_CANARY'];
const src=()=>({
  drivers:[{id:'d1',daCode:'DA0001',status:'aktiv',kapacitas:70,
    history:[{nested:'á PRIVÁT'}]}],
  vehicles:[{id:'v1',rendszam:'QA-001',status:'aktiv'}],
  fuelCards:[],contacts:[{id:'c',name:'PRIVATE_CONTACT_CANARY'}]
});
function noLeak(p){
  for(const secret of forbidden)
    assert.equal((p.stdout+p.stderr).includes(secret),false,
      'Failed private boundary may not echo '+secret);
}
const cliFiles=[
  {path:resolve('tools/v1-owner-readiness-cli.mjs'),
    reason:'INPUT_FILE_READ_FAILED'},
  {path:resolve('tools/v1-apps-script-cutover-cli.mjs'),
    reason:'MANIFEST_FILE_UNREADABLE'}
];
// The protobuf CLI imports pinned Firebase SDK from the staging dependency
// lane; test its symlink/UTF-8 denial in the mandatory Firebase SDK lane,
// NOT by silently skipping missing modules in the pure offline runner.
test('valid private UTF-8 includes every original accented and nested character byte-identically',()=>{
  const dir=mkdtempSync(join(tmpdir(),'imile-local-private-utf8-'));
  try{
    const path=join(dir,'private.json');
    const s=JSON.stringify(src());
    writeFileSync(path,s,{mode:0o600});
    const before=statSync(path).mtimeMs;
    assert.equal(readStrictPrivateUtf8File(path,1_200_000),s);
    assert.equal(readFileSync(path,'utf8'),s);
    assert.equal(statSync(path).mtimeMs,before,'Private input is never written');
  }finally{rmSync(dir,{force:true,recursive:true});}
});
test('direct private file read rejects symlinks, directories, zero and over-budget files',()=>{
  const dir=mkdtempSync(join(tmpdir(),'imile-file-boundary-'));
  try{
    const path=join(dir,'source.json'),link=join(dir,'sym.json'),
      empty=join(dir,'empty.json'),large=join(dir,'large.json');
    writeFileSync(path,'{"ok":true}',{mode:0o600});
    symlinkSync(path,link);
    writeFileSync(empty,'');
    writeFileSync(large,'x'.repeat(101));
    for(const [candidate,code] of [
      [link,'PRIVATE_FILE_NOT_REGULAR'],
      [dir,'PRIVATE_FILE_NOT_REGULAR'],
      [empty,'PRIVATE_FILE_SIZE_DENIED'],
      [large,'PRIVATE_FILE_SIZE_DENIED']
    ]){
      assert.throws(()=>readStrictPrivateUtf8File(candidate,100),
        e=>e.code===code,'Wrong code for '+code);
    }
  }finally{rmSync(dir,{force:true,recursive:true});}
});
test('malformed UTF-8 cannot turn into a valid JSON with U+FFFD replacement',()=>{
  const dir=mkdtempSync(join(tmpdir(),'imile-local-private-malformed-'));
  try{
    const input=join(dir,'invalid.json');
    writeFileSync(input,Buffer.from([123,34,120,34,58,34,0x80,34,125]));
    assert.throws(()=>readStrictPrivateUtf8File(input,128),
      e=>e.code==='PRIVATE_FILE_UNREADABLE_OR_BAD_UTF8');
  }finally{rmSync(dir,{force:true,recursive:true});}
});
test('both dependency-free private owner CLIs DENY symlink and malformed UTF-8, without paths in output',()=>{
  const dir=mkdtempSync(join(tmpdir(),'imile-PRIVATE_SOURCE_PATH_CANARY-'));
  try{
    const input=join(dir,'actual-PRIVATE_SOURCE_PATH_CANARY.json');
    const link=join(dir,'linked-PRIVATE_SOURCE_PATH_CANARY.json');
    const bad=join(dir,'bad-PRIVATE_SOURCE_PATH_CANARY.json');
    writeFileSync(input,JSON.stringify(src()),{mode:0o600});
    writeFileSync(bad,Buffer.from([123,34,120,34,58,34,0x80,34,125]));
    symlinkSync(input,link);
    for(const entry of cliFiles){
      for(const target of [link,bad]){
        const p=spawnSync(process.execPath,[entry.path,'--input',target,'--json'],
          {cwd:resolve('.'),encoding:'utf8',timeout:45000});
        assert.equal(p.status,1,p.stderr);
        const result=JSON.parse(p.stdout);
        const reasons=result.reasons||[result.reason];
        assert.ok(reasons.includes(entry.reason),
          'Reason mismatch for '+entry.path);
        noLeak(p);
      }
    }
  }finally{rmSync(dir,{force:true,recursive:true});}
});


test('same-size overwrite after descriptor preflight is rejected without returning torn source',()=>{
  const dir=mkdtempSync(join(tmpdir(),'imile-private-read-race-'));
  const input=join(dir,'source.json');
  writeFileSync(input,'{"ok":1}',{mode:0o600});
  const original=fs.fstatSync;let changed=false,handle;
  try{
    handle=test.mock.method(fs,'fstatSync',(...args)=>{
      const result=original(...args);
      if(!changed){
        changed=true;writeFileSync(input,'{"ok":2}');
        fs.utimesSync(input,new Date(),new Date(Date.now()+10000));
      }
      return result;
    });
    syncBuiltinESMExports();
    assert.throws(()=>readStrictPrivateUtf8File(input,100),
      error=>error.code==='PRIVATE_FILE_CHANGED_DURING_READ');
  }finally{handle?.mock.restore();syncBuiltinESMExports();rmSync(dir,{recursive:true,force:true});}
});

test('file growth during read is bounded to original descriptor size plus one byte',()=>{
  const dir=mkdtempSync(join(tmpdir(),'imile-private-growth-'));
  const input=join(dir,'source.json');
  const initial='{"ok":1}';writeFileSync(input,initial,{mode:0o600});
  const stat=fs.fstatSync,read=fs.readSync;let changed=false,requested=0,calls=0;
  let sh,rh;
  try{
    sh=test.mock.method(fs,'fstatSync',(...args)=>{
      const result=stat(...args);
      if(!changed){changed=true;fs.appendFileSync(input,'x'.repeat(200000));}
      return result;
    });
    rh=test.mock.method(fs,'readSync',(fd,buffer,offset,length,position)=>{
      requested+=length;calls++;
      return read(fd,buffer,offset,length,position);
    });
    syncBuiltinESMExports();
    assert.throws(()=>readStrictPrivateUtf8File(input,100),
      error=>error.code==='PRIVATE_FILE_CHANGED_DURING_READ');
    assert.ok(calls>0,'must use explicit bounded reads');
    assert.ok(requested<=Buffer.byteLength(initial)+1,'growth must not cause unbounded allocation/read');
  }finally{sh?.mock.restore();rh?.mock.restore();syncBuiltinESMExports();rmSync(dir,{recursive:true,force:true});}
});
