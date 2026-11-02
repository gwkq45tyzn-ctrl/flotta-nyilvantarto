import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,mkdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {makeManifest,verifyManifest,verifyBundle,digest,BASELINE,GENERATED_INDEX,GENERATED_CONFIG} from './release-manifest.mjs';
test('exact release source and all required components pinned',()=>{const m=makeManifest();assert.match(m.sourceCommit,/^[a-f0-9]{40}$/);assert.equal(m.baseline,BASELINE);for(const k of ['firestore','storage','functions','pwa','depo','managementFleetReports','buildAndCI'])assert.ok(m.components[k].length>0);assert.ok(verifyManifest(m));});
test('every runtime component carries Git blob and SHA256',()=>{for(const e of Object.values(makeManifest().components).flat()){assert.match(e.gitBlob,/^[a-f0-9]{40}$/);assert.match(e.sha256,/^[a-f0-9]{64}$/);}});
test('immutable manifest detects changed component and missing dependencies',()=>{for(const mutate of [m=>m.components.functions.pop(),m=>m.dependencies.pop(),m=>m.components.firestore[0].sha256='0'.repeat(64)]){const m=makeManifest();mutate(m);assert.throws(()=>verifyManifest(m),/MANIFEST_MISMATCH/);}});
test('wrong project, channel or claimed authorization rejected',()=>{for(const patch of [{project:'production'},{hostingChannel:'live'},{deploymentAuthorized:true}])assert.throws(()=>verifyManifest({...makeManifest(),...patch}),/INVALID_RELEASE_TARGET/);});
test('floating branch refs not release inputs',()=>assert.throws(()=>makeManifest('staging/imile-management-integration'),/EXACT_COMMIT_REQUIRED/));
test('manifest keeps initial policy closed then explicit next revision',()=>{const m=makeManifest();assert.deepEqual(m.policySequence.bootstrap,{revision:1,enabled:false});assert.deepEqual(m.policySequence.activation,{expectedRevision:1,revision:2,enabled:true});assert.equal(m.cloudDecision,'NO-GO');});
test('private backend, tests and credentials cannot enter web allowlist',()=>{assert.ok(makeManifest().webPaths.every(p=>!p.includes('photo-verifier/')&&!/node_modules|\.test\.|\.env|service.account/.test(p)));});
test('bundle verifier rejects extra files and tampered content',()=>{
 const root=mkdtempSync(join(tmpdir(),'imile-release-'));
 try{mkdirSync(join(root,'staging'));writeFileSync(join(root,'staging','a.mjs'),'SYNTHETIC');writeFileSync(join(root,'index.html'),GENERATED_INDEX);writeFileSync(join(root,'firebase.json'),JSON.stringify(GENERATED_CONFIG));
  const m={webPaths:['staging/a.mjs'],components:{qa:[{path:'staging/a.mjs',sha256:digest('SYNTHETIC')}]}};
  assert.equal(verifyBundle(m,root).length,3);writeFileSync(join(root,'secret.json'),'{}');assert.throws(()=>verifyBundle(m,root),/FILE_SET/);rmSync(join(root,'secret.json'));writeFileSync(join(root,'staging','a.mjs'),'CHANGED');assert.throws(()=>verifyBundle(m,root),/CONTENT_MISMATCH/);
 }finally{rmSync(root,{recursive:true,force:true});}
});
