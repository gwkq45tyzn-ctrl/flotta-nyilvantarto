import assert from 'node:assert/strict';
import test from 'node:test';
import {spawnSync} from 'node:child_process';
import {existsSync,readFileSync,readdirSync,rmSync,writeFileSync} from 'node:fs';
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
    assert.equal(hub.includes('href="./qa/index.html"'),false,
      'Packaged hub must not leak the omitted QA route');
    assert.equal(hub.includes('<span id="qaLink"'),true,
      'Hub must retain inert anchor ID for the JS menu handler');
    assert.match(hub,/href="\.\.\/\.\.\/index\.html" id="fleetLink"/);
    const depHtml=readFileSync(join(dest,'depokapacitas/index.html'),'utf8');
    assert.doesNotMatch(depHtml,/data-view="attendance"/);
    assert.doesNotMatch(depHtml,/data-view="results"/);
    assert.equal(depHtml.includes('href="./TELEPITES.md"'),false,
      'Offline artifact must not expose an unbundled installation guide');
    assert.ok(gate.files.every(p=>existsSync(join(dest,p))), 'Every manifest file must actually exist');
    assert.deepEqual(Object.keys(gate.fileSha256),gate.files,
      'Integrity manifest must hash every emitted artifact file');
    for(const file of gate.files)
      assert.equal(gate.fileSha256[file],sha(readFileSync(join(dest,file))),
        'Emitted-byte digest mismatch: '+file);
    const candidateDepotJs=readFileSync(join(dest,'depokapacitas/app.js'),'utf8');
    assert.equal(candidateDepotJs.includes('fleet/operations.html'),false,
      'Packaged Depot must never point at the omitted Fleet prototype');
    assert.equal(candidateDepotJs.includes('href="../index.html"'),true,
      'Depot detail page must open the unchanged original Fleet');
    const originalDepotJs=readFileSync(join(root,'depokapacitas/app.js'),'utf8');
    assert.equal(originalDepotJs.includes('fleet/operations.html'),true,
      'Only the packaged copy may be rewritten');
    assert.match(readFileSync(join(dest,'staging/imile-management/app.mjs'),'utf8'),/fleetMasterLink/);
    console.log('PASS original Fleet SHA, no reports/PWA/prototype, blocked source-only artifact');
  } finally {rmSync(dest,{recursive:true,force:true});}
});

test('core builder rejects a root-relative Fleet script that was not packaged',()=>{
  const fleetPath=join(root,'index.html');
  const original=readFileSync(fleetPath);
  assert.equal(existsSync(dest),false,'Never overwrite any existing QA artifact');
  try{
    const injected=Buffer.concat([original,Buffer.from('\n<script src="features/missing-fleet-module.js"></script>\n')]);
    writeFileSync(fleetPath,injected);
    const result=spawnSync(process.execPath,[build],{cwd:root,encoding:'utf8',timeout:25000});
    assert.notEqual(result.status,0,'A missing local Fleet script must fail the core build');
    assert.match((result.stderr||'')+(result.stdout||''),/missing-fleet-module\.js/);
  }finally{
    writeFileSync(fleetPath,original);
    rmSync(dest,{recursive:true,force:true});
    assert.deepEqual(readFileSync(fleetPath),original,'Original Fleet index.html must be restored byte-for-byte');
  }
});

test('core builder rejects a CSS url() that is not in the package',()=>{
  const cssPath=join(root,'depokapacitas/style.css');
  const original=readFileSync(cssPath);
  assert.equal(existsSync(dest),false,'Never overwrite any existing QA artifact');
  try{
    writeFileSync(cssPath,Buffer.concat([original,Buffer.from('\n.probe{background:url("./missing-core-font.woff")}\n')]));
    const result=spawnSync(process.execPath,[build],{cwd:root,encoding:'utf8',timeout:25000});
    assert.notEqual(result.status,0,'A missing local CSS asset must fail the core build');
    assert.match(result.stderr||'',/missing-core-font\.woff/);
  }finally{
    writeFileSync(cssPath,original);
    rmSync(dest,{recursive:true,force:true});
    assert.deepEqual(readFileSync(cssPath),original,'Depot CSS must be restored byte-for-byte');
  }
});

test('builder never publishes, imports or alters real Firebase/App Script',()=>{
  const src=readFileSync(build,'utf8');
  assert.doesNotMatch(src,/firebase-tools|action-hosting-deploy|hosting:channel:deploy|firebase\s+deploy\s+--only|GoogleAuth|setDoc\s*\(|writeBatch\s*\(|UrlFetchApp|SpreadsheetApp/);
  const workflow=readFileSync(join(root,'.github/workflows/imile-staging.yml'),'utf8');
  assert.doesNotMatch(workflow,/FirebaseExtended\/action-hosting-deploy|--only\s+firestore:rules|hosting:channel:deploy/);
  console.log('PASS no network/cloud migration/deployment in candidate builder and CI');
});
