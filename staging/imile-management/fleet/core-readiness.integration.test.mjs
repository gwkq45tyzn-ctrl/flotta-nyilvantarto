import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const menu=read('../index.html'),entry=read('../app.mjs'),
 master=read('./app.mjs'),operations=read('./operations-app.mjs'),
 build=read('../build-preview.mjs'),rules=read('../../../depokapacitas/firestore.rules');
assert.match(menu, /href="\.\/fleet\/operations\.html" id="fleetLink"/);
assert.match(menu, /href="\.\/fleet\/index\.html" id="fleetMasterLink"/);
assert.match(entry, /\$\('fleetMasterLink'\)\.hidden/);
assert.match(master,/import \{fleetAvailability\} from '\.\/availability\.mjs'/);
assert.match(master,/['"]fleetAssignments['"]/);
assert.match(master,/fleetAvailability\(\{vehicles:state\.vehicles/);
assert.match(master,/bookings:state\.bookings,day:depotToday\(\)/);
assert.match(master,/timeZone:'Europe\/Budapest'/);
assert.match(master,/loaded\.size===5/);
assert.match(master, /\$\('fleetContent'\)\.hidden=true/);
assert.match(operations,/Visszavétel előkészítése/);
assert.match(operations,/form\.elements\.action\.value='return'/);
assert.match(operations,/Ellenőrizd a valós km-órát/);
assert.match(operations,/loaded\.size===Object\.keys\(data\)\.length/);
assert.match(operations,/\$\('workspace'\)\.hidden=true/);
assert.match(build,/'staging\/imile-management\/fleet\/availability\.mjs'/);
assert.match(rules,/match \/fleetAssignments\/\{id\}/);
assert.match(rules,/allow read: if member\(\);/);
assert.doesNotMatch(build,/^\s*'index\.html',/m);
console.log('PASS: 18 core Fleet UI/availability/safe-loading integration checks');
