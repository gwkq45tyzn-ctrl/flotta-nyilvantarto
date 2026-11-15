/**
 * #186 source-only inventory regression.
 * Observations of files in the repository, not proof of a live deployment.
 * Does not fetch Google endpoints or print identifiers.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync, statSync} from 'node:fs';
import {join} from 'node:path';

const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');

/** Function body by name and indent. Nested functions keep a deeper indent, so a
 *  later sibling at the same indent ends the block. Line numbers are not inputs. */
function functionBlock(source, name) {
  const re = new RegExp('^([ \\t]*)(?:async\\s+)?function\\s+' + name + '\\s*\\(', 'm');
  const found = re.exec(source);
  assert.ok(found, 'missing function ' + name);
  const rest = source.slice(found.index + found[0].length);
  const next = rest.search(new RegExp('\\n' + found[1] + '(?:async\\s+)?function\\s+'));
  const text = source.slice(found.index, next < 0 ? source.length : found.index + found[0].length + next);
  return {text, line: source.slice(0, found.index).split('\n').length};
}

function before(text, earlier, later) {
  const a = text.indexOf(earlier);
  const b = text.indexOf(later);
  assert.ok(a >= 0, 'missing ' + earlier);
  assert.ok(b > a, later + ' is not after ' + earlier);
}

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

test('original HTML writer posts action save and is not the attendance script', () => {
  const html = read('../index.html');
  const save = functionBlock(html, 'save');
  const push = functionBlock(html, 'pushRemote');
  const pull = functionBlock(html, 'pullRemote');
  assert.match(save.text, /setTimeout\(pushRemote,/);
  assert.match(push.text, /mode:'no-cors'/);
  assert.match(push.text, /action:'save'/);
  assert.match(push.text, /fetch\(backendUrl/);
  assert.match(pull.text, /safeJsonp\(backendUrl\)/);
  assert.match(html, /const DEFAULT_BACKEND_URL/);
  assert.match(html, /setInterval\(\(\)=>\{if\(!dirty\)pullRemote\(true\)/);
  assert.doesNotMatch(push.text, /syncAttendance/);
  assert.doesNotMatch(push.text, /flottaSharedState/);
  const release = read('../flotta-nyilvantarto-elesitesre.html');
  assert.match(functionBlock(release, 'pushRemote').text, /mode:'no-cors'/);
  assert.match(release, /const DEFAULT_BACKEND_URL/);
  const v18 = read('../flotta-bejelentkezes-v18.html');
  assert.match(v18, /const DEFAULT_BACKEND_URL=''/);
  assert.match(functionBlock(v18, 'fleetPost').text, /async function fleetPost/);
  assert.match(functionBlock(v18, 'pushRemote').text, /action:'save'/);
});

test('bridge gates legacy sync at boot and after server-verified auth', () => {
  const bridge = read('../features/firestore-bridge.js');
  const gate = functionBlock(bridge, 'gateOldSync');
  assert.match(gate.text, /window\.pushRemote\s*=\s*function/);
  assert.match(gate.text, /window\.pullRemote\s*=\s*function/);
  assert.doesNotMatch(gate.text, /fetch\(/);
  assert.doesNotMatch(gate.text, /UrlFetchApp/);
  const boot = functionBlock(bridge, 'boot');
  before(boot.text, 'gateOldSync()', 'resumeIfSession()');
  const login = functionBlock(bridge, 'patchLogin');
  before(login.text, 'await verifyMember(', 'gateOldSync()');
  assert.match(login.text, /await auth\.signOut\(\)/);
  const resume = functionBlock(bridge, 'resumeIfSession');
  before(resume.text, 'await verifyMember(', 'gateOldSync()');
  const failed = resume.text.slice(resume.text.indexOf('} else {'));
  assert.doesNotMatch(failed, /gateOldSync\(/);
  const calls = bridge.match(/gateOldSync\s*\(/g) || [];
  assert.equal(calls.length, 4);
  const shifted = `${'/* inserted line */\n'.repeat(80)}${bridge}`;
  const moved = functionBlock(shifted, 'gateOldSync');
  assert.ok(moved.line > gate.line + 70);
  assert.match(moved.text, /window\.pushRemote\s*=\s*function/);
  assert.match(moved.text, /window\.pullRemote\s*=\s*function/);
  before(functionBlock(shifted, 'patchLogin').text, 'await verifyMember(', 'gateOldSync()');
});

test('attendance script is a different writer and does not touch Fleet masters', () => {
  const gs = read('../depokapacitas/google-sync/Code.gs');
  const sync = functionBlock(gs, 'syncAttendance');
  assert.match(sync.text, /UrlFetchApp\.fetch\(/);
  assert.match(sync.text, /documents\/attendance\//);
  assert.doesNotMatch(sync.text, /flottaSharedState/);
  assert.doesNotMatch(sync.text, /action:'save'/);
  assert.match(functionBlock(gs, 'installFiveMinuteTrigger').text, /everyMinutes\(5\)/);
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
  assert.match(manifest, /auth\/datastore/);
  assert.match(manifest, /spreadsheets\.readonly/);
  assert.match(manifest, /script\.scriptapp/);
});

test('published inventory cites the real functions and stays redacted', () => {
  const doc = read('./V1_APPS_SCRIPT_INVENTORY.md');
  assert.match(doc, /Status: NO-GO/);
  assert.match(doc, /UNKNOWN/);
  assert.match(doc, /BLOCKED_OWNER_ACCESS/);
  assert.match(doc, /`index\.html` function `save` and function `pushRemote`/);
  assert.match(doc, /action:'save'/);
  assert.match(doc, /function `gateOldSync`/);
  assert.match(doc, /function `boot`/);
  assert.match(doc, /function `patchLogin`/);
  assert.match(doc, /function `resumeIfSession`/);
  assert.match(doc, /function `syncAttendance`/);
  assert.doesNotMatch(doc, /firestore-bridge\.js:\d+/);
  assert.doesNotMatch(doc, /https:\/\/script\.google\.com\/macros\/s\/[^\s)]+/);
  assert.doesNotMatch(doc, /172WO6bYfJriFxIYl7MDT6dELQxzOgVrXuWUCNpJHaDI/);
});
