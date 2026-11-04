import assert from 'node:assert/strict';
import test from 'node:test';
import {spawnSync} from 'node:child_process';
import {existsSync,readFileSync,readdirSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';

const root=resolve(import.meta.dirname,'../..');
const dest=join(root,'candidate-imile-v1-core');
const build=join(root,'staging/imile-management/build-v1-core.mjs');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
test('offline narrow V1 QA bundle preserves original Fleet and excludes deferred UI',()=>{
  assert.equal(existsSync(dest),false,'Never overwrite any existing QA artifact');
  try{
    const result=spawnSync(process.execPath,[build],{cwd:root,encoding:'utf8',timeout:25000});
    assert.equal(result.status,0,result.stderr);
    assert.match(result.stdout,/NO-GO/);
    const rawFleet=readFileSync(join(root,'index.html'));
    const candidateFleet=readFileSync(join(dest,'index.html'));
    assert.deepEqual(candidateFleet,rawFleet,'Original Fleet source must not change');
    const gate=JSON.parse(readFileSync(join(dest,'V1_QA_ONLY_NO_RELEASE.json'),'utf8'));
    assert.equal(gate.status,'BLOCKED');
    assert.equal(gate.ownerReleaseApproved,false);
    assert.equal(gate.liveTwoPcVerified,false);
    assert.equal(gate.originalFleetSha256,sha(rawFleet));
    assert.ok(gate.files.includes('features/firestore-bridge.js'));
    assert.ok(gate.files.includes('depokapacitas/app.js'));
    assert.ok(gate.files.includes('staging/imile-management/index.html'));
    // Pure schema/alert helper can remain, but no prototype user interface.
    assert.ok(gate.files.includes('staging/imile-management/fleet/operations-data.mjs'));
    const alerts=readFileSync(join(dest,'staging/imile-management/central-alerts.mjs'),'utf8');
    assert.match(alerts,/actionUrl:'\.\.\/index\.html'/);
    assert.doesNotMatch(alerts,/fleet\/operations\.html/);
    assert.ok(gate.files.every(p=>!/(^|\/)(reports|qa|courier|attendance|photo|node_modules)(\/|$)/i.test(p)),JSON.stringify(gate.files));
    assert.equal(existsSync(join(dest,'staging/imile-management/reports/index.html')),false);
    assert.equal(existsSync(join(dest,'staging/imile-management/fleet/operations.html')),false);
    assert.equal(existsSync(join(dest,'depokapacitas/google-sync/Code.gs')),false);
    const hub=readFileSync(join(dest,'staging/imile-management/index.html'),'utf8');
    assert.doesNotMatch(hub,/class="card module reports"/);
    assert.doesNotMatch(hub,/href="\.\/reports\/index\.html"/);
    assert.doesNotMatch(hub,/href="\.\/fleet\/operations\.html"/);
    assert.match(hub,/href="\.\.\/\.\.\/index\.html" id="fleetLink"/);
    const depHtml=readFileSync(join(dest,'depokapacitas/index.html'),'utf8');
    assert.doesNotMatch(depHtml,/data-view="attendance"/);
    assert.doesNotMatch(depHtml,/data-view="results"/);
    assert.ok(gate.files.every(p=>existsSync(join(dest,p))), 'Every manifest file must actually exist');
    assert.match(readFileSync(join(dest,'staging/imile-management/app.mjs'),'utf8'),/fleetMasterLink/);
    console.log('PASS original Fleet SHA, no reports/PWA/prototype, blocked source-only artifact');
  } finally {rmSync(dest,{recursive:true,force:true});}
});

test('builder never publishes, imports or alters real Firebase/App Script',()=>{
  const src=readFileSync(build,'utf8');
  assert.doesNotMatch(src,/firebase-tools|action-hosting-deploy|hosting:channel:deploy|firebase\s+deploy\s+--only|GoogleAuth|setDoc\s*\(|writeBatch\s*\(|UrlFetchApp|SpreadsheetApp/);
  const workflow=readFileSync(join(root,'.github/workflows/imile-staging.yml'),'utf8');
  assert.doesNotMatch(workflow,/FirebaseExtended\/action-hosting-deploy|--only\s+firestore:rules|hosting:channel:deploy/);
  console.log('PASS no network/cloud migration/deployment in candidate builder and CI');
});
