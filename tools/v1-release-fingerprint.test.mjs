import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,symlinkSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fingerprintSources,SOURCE_FILES} from './v1-release-fingerprint.mjs';

const commitSha='a'.repeat(40);
function fixture(t){
  const root=mkdtempSync(join(tmpdir(),'imile-release-fingerprint-'));
  t.after(()=>rmSync(root,{recursive:true,force:true}));
  mkdirSync(join(root,'features'));
  writeFileSync(join(root,'index.html'),'<html>Original</html>');
  writeFileSync(join(root,'features','bridge.js'),'export const v = 1;');
  return {
    root,items:[
      {role:'original-fleet-html',path:'index.html'},
      {role:'bridge',path:'features/bridge.js'}
    ]
  };
}
test('source bundle has deterministic exact-SHA content fingerprints independent of list order',t=>{
  const f=fixture(t);
  const first=fingerprintSources({...f,commitSha});
  const reversed=fingerprintSources({root:f.root,commitSha,items:[...f.items].reverse()});
  assert.equal(first.sourceBundleSha256,reversed.sourceBundleSha256);
  assert.deepEqual(first.files,reversed.files);
  assert.equal(first.files.length,2);
  assert.match(first.files[0].sha256,/^[a-f0-9]{64}$/);
  assert.equal(first.productionReleaseAuthorized,false);
  assert.equal(first.artifactDeployed,false);
  assert.equal(first.ownerReleaseApproved,false);
  assert.equal(first.independentGrokFullGo,false);
  assert.equal(first.independentChatGptFullGo,false);
  assert.equal(first.productionIamVerified,false);
  assert.equal(first.evidenceType,'V1_READ_ONLY_SOURCE_FINGERPRINT_NOT_DEPLOY_ATTESTATION');
});

test('mutating HTML, Rules-equivalent bridge or commit changes the bundle hash',t=>{
  const f=fixture(t);
  const original=fingerprintSources({...f,commitSha});
  writeFileSync(join(f.root,'index.html'),'<html>Changed</html>');
  const changed=fingerprintSources({...f,commitSha});
  assert.notEqual(original.sourceBundleSha256,changed.sourceBundleSha256);
  assert.notEqual(original.files.find(x=>x.path==='index.html').sha256,
    changed.files.find(x=>x.path==='index.html').sha256);
  const otherCommit=fingerprintSources({...f,commitSha:'b'.repeat(40)});
  assert.notEqual(changed.sourceBundleSha256,otherCommit.sourceBundleSha256);
});

test('reject missing source, symlinks, path traversal and duplicate roles',t=>{
  const f=fixture(t);
  assert.throws(()=>fingerprintSources({
    ...f,commitSha,items:[{role:'bad',path:'../private-backup.json'}]
  }),/INVALID_SOURCE_RELATIVE_PATH/);
  assert.throws(()=>fingerprintSources({
    ...f,commitSha,items:[{role:'missing',path:'missing-file.js'}]
  }));
  symlinkSync(join(f.root,'index.html'),join(f.root,'leak.html'));
  assert.throws(()=>fingerprintSources({
    ...f,commitSha,items:[{role:'alias',path:'leak.html'}]
  }),/RELEASE_SOURCE_NOT_REGULAR_FILE/);
  assert.throws(()=>fingerprintSources({
    ...f,commitSha,items:[f.items[0],{role:'original-fleet-html',path:'features/bridge.js'}]
  }),/DUPLICATE_OR_INVALID_SOURCE_ENTRY/);
  assert.throws(()=>fingerprintSources({...f,commitSha:'invalid'}),/EXACT_COMMIT_AND_FILES_REQUIRED/);
});

test('manifest covers original Fleet/Depot/Rules, migration and private source readiness',()=>{
  const roles=new Set(SOURCE_FILES.map(x=>x.role));
  for(const role of [
    'original-fleet-html','original-fleet-firestore-bridge',
    'depot-desktop-html','restricted-firestore-rules',
    'migration-four-block-planner','migration-readiness-preflight',
    'private-source-cli','reports-business-contract'
  ])assert.equal(roles.has(role),true,role);
  assert.equal(SOURCE_FILES.length,new Set(SOURCE_FILES.map(x=>x.path)).size);
});
