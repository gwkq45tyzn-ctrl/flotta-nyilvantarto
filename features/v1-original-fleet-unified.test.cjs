/** Original production Fleet source + unified iMile V1 routing regression.
 * Run: node --test features/v1-original-fleet-unified.test.cjs
 * No Firebase access, real data, cloud credentials or deployment.
 */
'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const fleet=read('index.html');
const portal=read('staging/imile-management/index.html');
const app=read('staging/imile-management/app.mjs');
const bridge=read('features/firestore-bridge.js');

test('one unified V1 routes to ORIGINAL rich Fleet, Depot and reports, not prototype',()=>{
  assert.match(portal,/id="fleetLink"[^>]*|href="\.\.\/\.\.\/index\.html" id="fleetLink"/);
  assert.match(portal,/href="\.\.\/\.\.\/depokapacitas\/index\.html" id="depoLink"/);
  assert.match(portal,/href="\.\/reports\/index\.html" id="reportsLink"/);
  assert.doesNotMatch(portal,/id="fleetMasterLink"/);
  assert.doesNotMatch(app,/\$\('fleetMasterLink'\)/);
  for(const href of [
    './staging/imile-management/index.html',
    './depokapacitas/index.html',
    './staging/imile-management/reports/index.html'
  ]) assert.ok(fleet.includes('href="'+href+'"'),href);
});
test('ORIGINAL complete Fleet remains intact with rich features and guarded cloud bridge',()=>{
  for(const exact of ['function snapshot()','function applySnapshot(',
    'function saveVehicle(','function saveDriver(','function exportData(',
    '<script src="features/firestore-bridge.js"></script>',
    '<script src="features/vehicle-groups-v27.js"></script>',
    '<script src="features/active-driver-assignment-v25.js"></script>'])
    assert.ok(fleet.includes(exact),'Missing original feature '+exact);
  assert.match(fleet,/Közös Firestore kapcsolat/);
  assert.doesNotMatch(fleet,/onclick="configureBackend\(\)"/);
  assert.match(bridge,/PRESEAL_FLEET_READ_ONLY_UNTIL_TRUSTED_IMPORT/);
  assert.match(bridge,/function patchSessionGate\(/);
});
const start=bridge.indexOf('  function canonicalRows(');
const stop=bridge.indexOf('\n  function sealedProjection(',start);
assert.ok(start>0&&stop>start,'actual Fleet canonicalRows source must be available');
const canonicalRows=vm.runInNewContext(bridge.slice(start,stop)+'\ncanonicalRows;',{});
const d=(key,da=key,storedId='driver-a')=>({key,data:{id:storedId,daCode:da,kapacitas:80,history:[{event:'kept'}]}});
const v=(key,plate=key,storedId='vehicle-a')=>({key,data:{id:storedId,rendszam:plate,status:'aktiv',history:[{service:'preserved'}]}});
test('original Fleet: valid full-rich keyed record is preserved',()=>{
  const result=canonicalRows([d('DA0001')],[{id:'driver-a',daCode:'DA0001'}],'drivers');
  assert.equal(result?.length,1);
  assert.equal(result[0].history[0].event,'kept');
  assert.equal(result[0].kapacitas,80);
});
test('original Fleet: poison duplicate normalized driver in privileged archive is NOT displayed live',()=>{
  const archive=[{id:'driver-a',daCode:'DA0001'},{id:'driver-b',daCode:'da0001'}];
  assert.equal(canonicalRows([d('DA0001')],archive,'drivers'),null);
});
test('original Fleet: poison duplicate normalized plate in privileged archive is NOT displayed live',()=>{
  const archive=[{id:'vehicle-a',rendszam:'ABC-123'},{id:'vehicle-b',rendszam:'abc 123'}];
  assert.equal(canonicalRows([v('ABC123','ABC-123')],archive,'vehicles'),null);
});
test('original Fleet: unknown extra keyed master, malformed row, missing master fail closed',()=>{
  const archive=[{id:'driver-a',daCode:'DA0001'}];
  assert.equal(canonicalRows([d('DA0001'),d('DA0002','DA0002','driver-b')],archive,'drivers'),null);
  assert.equal(canonicalRows([d('DA0001'),{key:'DA0002',data:null}],archive,'drivers'),null);
  assert.equal(canonicalRows([],archive,'drivers'),null);
});
