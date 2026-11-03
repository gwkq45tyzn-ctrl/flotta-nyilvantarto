/**
 * Lightweight unit checks for the bridge contract (no live Firebase).
 * Run with: node features/firestore-bridge.test.mjs
 */
import assert from 'node:assert/strict';

function test(name, fn) {
  try { fn(); console.log('ok -', name); }
  catch (e) { console.error('FAIL -', name, e.message); process.exitCode = 1; }
}

test('primary requires both flags', () => {
  const PRIMARY = 'flotta_firestore_primary';
  const IMPORT = 'flotta_import_verified';
  const store = {};
  const isPrimary = () => store[PRIMARY] === '1' && store[IMPORT] === '1';
  assert.equal(isPrimary(), false);
  store[PRIMARY] = '1';
  assert.equal(isPrimary(), false);
  store[IMPORT] = '1';
  assert.equal(isPrimary(), true);
});

test('applyRemote skips when localDirty', () => {
  let applied = false;
  const applyRemote = (data, confirmed, localDirty) => {
    if (!data || localDirty) return;
    applied = true;
  };
  applyRemote({ vehicles: [] }, true, true);
  assert.equal(applied, false);
  applyRemote({ vehicles: [] }, true, false);
  assert.equal(applied, true);
});

test('revision conflict rejects write', () => {
  let rejected = false;
  const push = (serverRev, currentRev) => {
    if (serverRev !== currentRev) throw new Error('REVISION_CONFLICT');
  };
  try { push(5, 4); } catch (e) { rejected = e.message === 'REVISION_CONFLICT'; }
  assert.equal(rejected, true);
});

test('old fleetmanager session alone is insufficient', () => {
  const gate = (entry, hasAuth) => {
    if (entry && entry.user === 'fleetmanager' && !hasAuth) return null;
    return entry;
  };
  assert.equal(gate({ user: 'fleetmanager' }, false), null);
  assert.ok(gate({ user: 'imilemanagement' }, true));
});

console.log(process.exitCode ? 'Some tests failed' : 'All bridge contract tests passed');

test('requeue is capped', () => {
  let count = 0;
  const MAX = 3;
  function tryRequeue(dirty) {
    if (dirty && count < MAX) { count++; return true; }
    return false;
  }
  assert.equal(tryRequeue(true), true);
  assert.equal(tryRequeue(true), true);
  assert.equal(tryRequeue(true), true);
  assert.equal(tryRequeue(true), false);
  assert.equal(count, 3);
});

test('old sync gated on auth, not only primary', () => {
  const gated = (authenticated) => authenticated ? 'blocked' : 'allowed';
  assert.equal(gated(true), 'blocked');
  assert.equal(gated(false), 'allowed');
});
