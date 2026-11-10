import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  CRITICAL_V1_SOURCES,auditCriticalSource,auditLocalV1CriticalSources,
  auditV1CriticalSources
} from './verify-v1-critical-sources.mjs';

const paths=Object.keys(CRITICAL_V1_SOURCES);
const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const snapshot=()=>Object.fromEntries(paths.map(path=>[path,source(path)]));

test('existing actual original Fleet HTML + restricted Rules + bridge pass presence check only',()=>{
  const r=auditLocalV1CriticalSources();
  assert.equal(r.status,'STRUCTURE_PRESENT_ONLY',JSON.stringify(r.files));
  assert.equal(r.releaseAuthorized,false);
  assert.equal(r.productionRulesValidated,false);
  assert.equal(r.emulatorSecurityProven,false);
  assert.equal(r.files.length,3);
  assert.ok(r.files.every(x=>x.valid));
});

test('observed 2026-11-06 Grok placeholder files are explicitly BLOCKED',()=>{
  const data=snapshot();
  data['depokapacitas/firestore-v1-restricted.rules']='PLACEHOLDER';
  data['features/firestore-bridge.js']='PLACEHOLDER_BRIDGE_CONTENT_WILL_BE_REPLACED_IN_NEXT_IF_NEEDED';
  const r=auditV1CriticalSources(path=>data[path]);
  assert.equal(r.status,'BLOCKED');
  for(const f of r.files.filter(x=>x.path!=='index.html')){
    assert.ok(f.errors.includes('PLACEHOLDER_SOURCE'));
    assert.ok(f.errors.includes('TRUNCATED_OR_UNREVIEWED_SOURCE'));
  }
});

test('padding cannot turn placeholders into credible security source',()=>{
  for(const path of paths){
    const bytes=CRITICAL_V1_SOURCES[path].minimumUtf8Bytes;
    const result=auditCriticalSource(path,'PLACEHOLDER'+' '.repeat(bytes));
    assert.equal(result.valid,false);
    assert.ok(result.errors.includes('PLACEHOLDER_SOURCE'));
  }
});

test('long fake file without crucial structural components is blocked',()=>{
  for(const path of paths){
    const source='// fake test content\n'.repeat(
      Math.ceil(CRITICAL_V1_SOURCES[path].minimumUtf8Bytes/20)+1);
    const result=auditCriticalSource(path,source);
    assert.equal(result.valid,false);
    assert.ok(result.errors.some(x=>x.startsWith('MISSING_REQUIRED_STRUCTURE')));
  }
});

test('truncated legitimate source or missing core guard is blocked',()=>{
  for(const path of paths){
    const s=source(path);
    const cut=auditCriticalSource(path,s.slice(0,200));
    assert.equal(cut.valid,false);
    assert.ok(cut.errors.includes('TRUNCATED_OR_UNREVIEWED_SOURCE'));
    for(const signature of CRITICAL_V1_SOURCES[path].signatures){
      const replaced=s.split(signature).join('REMOVED_SYNTHETIC_SIGNATURE');
      assert.notEqual(replaced,s,'Expected baseline signature missing '+signature);
      const outcome=auditCriticalSource(path,replaced);
      assert.equal(outcome.valid,false,'Must reject removed '+signature);
      assert.ok(outcome.errors.some(x=>x.includes(signature)));
    }
  }
});

test('missing unreadable source fails closed without exposing file contents',()=>{
  const data=snapshot();
  delete data['features/firestore-bridge.js'];
  const r=auditV1CriticalSources(path=>{
    if(!(path in data)){const e=Error('not found');e.code='ENOENT';throw e;}
    return data[path];
  });
  assert.equal(r.status,'BLOCKED');
  const missing=r.files.find(x=>x.path==='features/firestore-bridge.js');
  assert.equal(missing.valid,false);
  assert.ok(missing.errors.some(x=>x.startsWith('SOURCE_READ_FAILED')));
});

test('invalid arguments cannot masquerade as missing or approved source',()=>{
  assert.throws(()=>auditCriticalSource('not-a-real-file','PLACEHOLDER'),/Unknown V1 critical source/);
  assert.throws(()=>auditV1CriticalSources(null),/source reader/);
  for(const path of paths){
    assert.equal(auditCriticalSource(path,null).valid,false);
    assert.equal(auditCriticalSource(path,'').valid,false);
  }
});

test('validator performs no deploy or GitHub/network operations',()=>{
  const s=source('tools/verify-v1-critical-sources.mjs');
  assert.doesNotMatch(s,/firebase\s*\.\s*deploy|execSync\s*\(|https\s*:\s*\/\/|fetch\s*\(/);
});
