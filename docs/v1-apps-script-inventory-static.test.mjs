/**
 * #186 source-only inventory regression.
 * Observations of files in the repository, not proof of a live deployment.
 * Does not fetch Google endpoints or print identifiers.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync, statSync} from 'node:fs';
import {join} from 'node:path';

const root = new URL('..', import.meta.url);
const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');
const lines = p => read(p).split(/\n/);
const slice = (p, start, end) => lines(p).slice(start - 1, end).join('\n');

function walk(dir, out=[]) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.git') continue;
    const path = join(dir, name);
    const st = statSync(path);
    if (st.isDirectory()) walk(path, out);
    else if (name.endsWith('.gs')) out.push(path);
  }
  return out;
}

test('original Fleet HTML writer is the cited pushRemote range', () => {
  const body = slice('../index.html', 1212, 1254);
  assert.match(body, /function save\s*\(/);
  assert.match(body, /async function pushRemote\s*\(/);
  assert.match(body, /mode:'no-cors'/);
  assert.match(body, /action:'save'/);
  assert.match(slice('../index.html', 1186, 1198), /async function pullRemote\s*\(/);
  assert.match(slice('../index.html', 1255, 1268), /setInterval\(\(\)=>\{if\(!dirty\)pullRemote\(true\)/);
  assert.match(slice('../index.html', 1157, 1161), /const DEFAULT_BACKEND_URL/);
});

test('release HTML copy has its own writer, not the index.html line numbers', () => {
  const body = slice('../flotta-nyilvantarto-elesitesre.html', 1212, 1246);
  assert.match(body, /async function pushRemote\s*\(/);
  assert.match(body, /mode:'no-cors'/);
  assert.match(slice('../flotta-nyilvantarto-elesitesre.html', 1152, 1153), /const DEFAULT_BACKEND_URL/);
});

test('v18 HTML posts only when a backend URL was configured', () => {
  assert.match(slice('../flotta-bejelentkezes-v18.html', 1103, 1103), /const DEFAULT_BACKEND_URL=''/);
  assert.match(slice('../flotta-bejelentkezes-v18.html', 1141, 1145), /async function fleetPost/);
  assert.match(slice('../flotta-bejelentkezes-v18.html', 1229, 1254), /async function pushRemote/);
  assert.match(slice('../flotta-bejelentkezes-v18.html', 1229, 1254), /action:'save'/);
});

test('bridge gates legacy sync at boot and after auth', () => {
  const gate = slice('../features/firestore-bridge.js', 579, 594);
  assert.match(gate, /function gateOldSync\s*\(/);
  assert.match(gate, /window\.pushRemote\s*=\s*function/);
  assert.match(gate, /window\.pullRemote\s*=\s*function/);
  assert.match(slice('../features/firestore-bridge.js', 773, 773), /gateOldSync\(\)/);
  assert.match(slice('../features/firestore-bridge.js', 817, 817), /gateOldSync\(\)/);
  assert.match(slice('../features/firestore-bridge.js', 866, 873), /gateOldSync\(\)/);
});

test('attendance script is a different writer and does not touch Fleet masters', () => {
  const gs = read('../depokapacitas/google-sync/Code.gs');
  assert.match(slice('../depokapacitas/google-sync/Code.gs', 13, 20), /function syncAttendance\s*\(/);
  assert.match(slice('../depokapacitas/google-sync/Code.gs', 65, 80), /UrlFetchApp\.fetch\(/);
  assert.match(slice('../depokapacitas/google-sync/Code.gs', 65, 80), /documents\/attendance\//);
  assert.match(slice('../depokapacitas/google-sync/Code.gs', 98, 105), /function installFiveMinuteTrigger\s*\(/);
  assert.match(slice('../depokapacitas/google-sync/Code.gs', 98, 105), /everyMinutes\(5\)/);
  assert.doesNotMatch(gs, /flottaSharedState/);
  assert.doesNotMatch(gs, /function doGet\s*\(/);
  assert.doesNotMatch(gs, /function doPost\s*\(/);
});

test('no Fleet web app server is checked into the repository', () => {
  const gsFiles = walk(new URL('..', import.meta.url).pathname);
  assert.ok(gsFiles.some(p => p.endsWith('depokapacitas/google-sync/Code.gs')));
  for (const file of gsFiles) {
    const text = readFileSync(file, 'utf8');
    assert.doesNotMatch(text, /function doGet\s*\(/, file);
    assert.doesNotMatch(text, /function doPost\s*\(/, file);
  }
});

test('attendance manifest scope is broader than the attendance commit', () => {
  const manifest = read('../depokapacitas/google-sync/appsscript.json');
  assert.match(slice('../depokapacitas/google-sync/appsscript.json', 5, 9), /auth\/datastore/);
  assert.match(manifest, /spreadsheets\.readonly/);
  assert.match(manifest, /script\.scriptapp/);
});

test('published inventory matches these pins and stays redacted', () => {
  const doc = read('./V1_APPS_SCRIPT_INVENTORY.md');
  assert.match(doc, /Status: NO-GO/);
  assert.match(doc, /UNKNOWN/);
  assert.match(doc, /BLOCKED_OWNER_ACCESS/);
  assert.match(doc, /index\.html:1212-1254/);
  assert.match(doc, /index\.html:1220-1254/);
  assert.match(doc, /firestore-bridge\.js:866-873/);
  assert.match(doc, /Code\.gs:65-80/);
  assert.doesNotMatch(doc, /https:\/\/script\.google\.com\/macros\/s\/[^\s)]+/);
  assert.doesNotMatch(doc, /172WO6bYfJriFxIYl7MDT6dELQxzOgVrXuWUCNpJHaDI/);
});
