/**
 * #186 source-only inventory regression.
 * These are OBSERVATIONS of files in repository, not proof of active deployment.
 * Does not fetch Google endpoints or expose identifiers.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');

test('original Fleet HTML contains a real legacy Apps Script POST and JSONP reader',()=>{
  const original=read('../index.html');
  assert.match(original,/async function pushRemote\s*\(/);
  assert.match(original,/async function pullRemote\s*\(/);
  assert.match(original,/mode:'no-cors'/);
  assert.match(original,/const DEFAULT_BACKEND_URL/);
  assert.match(original,/setInterval\(\(\)=>\{if\(!dirty\)pullRemote\(true\)/);
});
test('integrated browser bridge guards legacy sync but only in that browser',()=>{
  const bridge=read('../features/firestore-bridge.js');
  assert.match(bridge,/function gateOldSync\s*\(/);
  assert.match(bridge,/window\.pushRemote\s*=\s*function/);
  assert.match(bridge,/window\.pullRemote\s*=\s*function/);
});
test('separate Apps Script source writes attendance and defines five-minute trigger',()=>{
  const gs=read('../depokapacitas/google-sync/Code.gs');
  assert.match(gs,/function syncAttendance\s*\(/);
  assert.match(gs,/documents\/attendance\//);
  assert.match(gs,/UrlFetchApp\.fetch\(/);
  assert.match(gs,/function installFiveMinuteTrigger\s*\(/);
  assert.match(gs,/everyMinutes\(5\)/);
});
test('legacy authenticated Fleet variant contains independent Apps Script endpoint input',()=>{
  const other=read('../flotta-bejelentkezes-v18.html');
  assert.match(other,/const DEFAULT_BACKEND_URL/);
  assert.match(other,/async function fleetPost\s*\(/);
});
test('public inventory contains no actual deployed endpoint, hard-coded Sheet ID or secret',()=>{
  const doc=read('./V1_APPS_SCRIPT_INVENTORY.md');
  assert.match(doc,/Status: NO-GO/);
  assert.match(doc,/unknown/i);
  assert.match(doc,/index\.html:1214-1254/);
  assert.match(doc,/Code\.gs:65-80/);
  assert.doesNotMatch(doc,/https:\/\/script\.google\.com\/macros\/s\/[^\s)]+/);
  assert.doesNotMatch(doc,/172WO6bYfJriFxIYl7MDT6dELQxzOgVrXuWUCNpJHaDI/);
});
