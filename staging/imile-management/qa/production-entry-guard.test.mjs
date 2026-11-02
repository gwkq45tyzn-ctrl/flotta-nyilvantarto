import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,mkdirSync,rmSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {execFileSync} from 'node:child_process';
import {checkProductionEntry} from './production-entry-guard.mjs';
test('real Git: external main movement is allowed, own entry/features edits are rejected',()=>{
 const cwd=mkdtempSync(join(tmpdir(),'imile-entry-guard-'));
 const git=(...args)=>execFileSync('git',args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 try{
  git('init');git('config','user.name','Synthetic QA');git('config','user.email','synthetic@example.invalid');
  writeFileSync(join(cwd,'index.html'),'legacy original');git('add','.');git('commit','-m','synthetic base');const base=git('rev-parse','HEAD');
  git('checkout','-b','candidate');mkdirSync(join(cwd,'staging'));writeFileSync(join(cwd,'staging','test.txt'),'quota');git('add','.');git('commit','-m','candidate');const candidate=git('rev-parse','HEAD');
  git('checkout','-b','production',base);writeFileSync(join(cwd,'index.html'),'new independent production');git('add','.');git('commit','-m','external production change');git('checkout','candidate');
  assert.equal(checkProductionEntry({baseSha:base,cwd,fetchBase:false}),true);
  writeFileSync(join(cwd,'index.html'),'new independent production');git('add','.');git('commit','-m','forbidden own entry change');
  assert.throws(()=>checkProductionEntry({baseSha:base,cwd,fetchBase:false}),/PROTECTED_FLOTTA_ENTRY_CHANGED/);
  git('checkout','-b','feature-negative',candidate);mkdirSync(join(cwd,'features'));writeFileSync(join(cwd,'features','forbidden.js'),'production feature');git('add','.');git('commit','-m','forbidden own feature');
  assert.throws(()=>checkProductionEntry({baseSha:base,cwd,fetchBase:false}),/PROTECTED_FLOTTA_ENTRY_CHANGED/);
 }finally{
  const target=realpathSync(cwd),prefix=resolve(realpathSync(tmpdir()))+sep+'imile-entry-guard-';
  if(!target.startsWith(prefix))throw Error('UNSAFE_TEST_CLEANUP');rmSync(target,{recursive:true,force:true});
 }
});
test('missing, zero or argument-like base fails closed before any Git operation',()=>{
 for(const baseSha of [undefined,'0'.repeat(40),'--help','main','abcdef'])assert.throws(()=>checkProductionEntry({baseSha,fetchBase:false}),/PROTECTED_BASE_SHA_REQUIRED/);
});
