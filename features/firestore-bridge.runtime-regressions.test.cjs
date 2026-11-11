/**
 * Synthetic runtime regression tests for the ORIGINAL Fleet/Firestore bridge.
 * Run: node --test features/firestore-bridge.runtime-regressions.test.cjs
 *
 * No Firebase network, real credentials, deployment, or production data.
 * The test executes the ACTUAL bridge script in a fake-browser VM.
 * Intentionally failing tests identify release blockers until Grok fixes them.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const bridgeSource = fs.readFileSync(path.join(__dirname, 'firestore-bridge.js'), 'utf8');
const SHARED_EMAIL = 'imilemanagement@imile-management-staging.firebaseapp.com';

function makeHarness({ importVerified = false, sourceShaMismatch = false } = {}) {
  const storage = new Map(importVerified ? [['flotta_import_verified', '1'], ['flotta_migration_token', 'verified-import']] : []);
  const session = new Map();
  const elements = {
    flottaUsername: { value: 'imilemanagement' },
    flottaPassword: { value: 'synthetic-test-password' },
    flottaLoginMessage: { textContent: '' },
    flottaLoginSubmit: { disabled: false },
    syncStatus: { textContent: '', style: {} }
  };

  let unlocked = false;
  let uploads = 0;
  let fleet = { vehicles: [{ id: 'synthetic-v1', km: 0 }], drivers: [], fuelCards: [], contacts: [] };
  let remote = {
    ...structuredClone(fleet),
    revision: importVerified ? 1 : 0,
    ...(importVerified ? { migrationSourceSha256: (sourceShaMismatch ? 'b' : 'c').repeat(64) } : {})
  };
  let releaseTransaction;
  const transactionBarrier = new Promise(resolve => { releaseTransaction = resolve; });

  const sharedUser = { uid: 'synthetic-uid', email: SHARED_EMAIL };
  const auth = {
    currentUser: null,
    async signInWithEmailAndPassword(email) {
      assert.equal(email, SHARED_EMAIL);
      auth.currentUser = sharedUser;
      return { user: sharedUser };
    },
    async signOut() { auth.currentUser = null; },
    onAuthStateChanged() { return () => {}; }
  };

  const db = {
    settings() {},
    doc(pathName) {
      return {
        async get(options) {
          assert.equal(options?.source, 'server','Migration gate must be checked on the server');
          if(pathName==='users/synthetic-uid')
            return { exists: true, data: () => ({ active: true, role: 'admin' }) };
          if(pathName==='flottaMigrationApproval/current')
            return {exists:importVerified,data:()=>({
              status:'approved',approvedUid:sharedUser.uid,sourceSha256:'c'.repeat(64)
            })};
          if(pathName==='flottaSharedState/current')
            return {exists:importVerified,data:()=>structuredClone(remote)};
          throw Error('Unexpected document read: '+pathName);
        },
        onSnapshot(options, handler) {
          if(pathName==='flottaSharedState/current'&&importVerified){
            queueMicrotask(()=>handler({
              exists:true,metadata:{fromCache:false,hasPendingWrites:false},
              data:()=>structuredClone(remote)
            }));
          }
          return () => {};
        }
      };
    },
    async runTransaction(callback) {
      uploads++;
      let staged = null;
      const transaction = {
        async get() { return { exists: true, data: () => remote }; },
        set(_ref, payload) { staged = structuredClone(payload); }
      };
      const revision = await callback(transaction);
      await transactionBarrier;
      remote = staged;
      return revision;
    }
  };

  const firestore = () => db;
  firestore.FieldValue = { serverTimestamp: () => null };
  const localStorage = {
    getItem: k => storage.get(k) ?? null,
    setItem: (k, value) => storage.set(k, String(value)),
    removeItem: k => storage.delete(k)
  };
  const sessionStorage = {
    getItem: k => session.get(k) ?? null,
    setItem: (k, value) => session.set(k, String(value)),
    removeItem: k => session.delete(k)
  };
  const context = {
    console: { error() {} },
    document: { readyState: 'complete', getElementById: id => elements[id] ?? null },
    localStorage,
    sessionStorage,
    firebase: { initializeApp: () => ({}), auth: () => auth, firestore },
    setTimeout() { throw Error('Unexpected polling: original Fleet globals should already exist'); },
    addEventListener() {},
    fleetSimpleLogin() {},
    fleetSimpleLogout() {},
    fleetGateSession() {
      const entry = JSON.parse(sessionStorage.getItem('flotta_simple_session_v23') || 'null');
      return entry?.user === 'fleetmanager' ? entry : null;
    },
    fleetGateDisplay() {
      unlocked = Boolean(context.fleetGateSession());
      return unlocked;
    },
    load() {},
    save() {
      localStorage.setItem('flotta_pending_v16', JSON.stringify(fleet));
    },
    snapshot() { return structuredClone(fleet); },
    applySnapshot(data) { fleet = structuredClone(data); }
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(bridgeSource, context, { filename: 'features/firestore-bridge.js' });

  return {
    login: () => context.fleetSimpleLogin({ preventDefault() {} }),
    isAuthenticated: () => Boolean(auth.currentUser),
    isUnlocked: () => unlocked,
    save: () => context.save(),
    setKm(km) { fleet.vehicles[0].km = km; },
    getRemoteKm: () => remote.vehicles[0].km,
    getRemoteSha: () => remote.migrationSourceSha256,
    stripRemoteSha() { delete remote.migrationSourceSha256; },
    getLocalKm: () => fleet.vehicles[0].km,
    pending: () => storage.has('flotta_pending_v16'),
    uploadCount: () => uploads,
    status: () => elements.syncStatus.textContent,
    releaseTransaction
  };
}

test('first Firebase login opens original Fleet read-only UI before import verification', async () => {
  const h = makeHarness({ importVerified: false });
  await h.login();
  assert.equal(h.isAuthenticated(), true);
  assert.equal(h.isUnlocked(), true,
    'Authentication succeeded, but the original Fleet UI remained locked');
});

test('preseal original Fleet rapid edits cannot write or stage phantom local data', async () => {
  const h = makeHarness({ importVerified: true });
  await h.login();
  assert.equal(h.isUnlocked(), true, 'Approved read-only Fleet UI must remain accessible');
  await new Promise(resolve => setImmediate(resolve));
  h.setKm(100);
  h.save();
  h.setKm(200);
  h.save();
  await new Promise(resolve => setImmediate(resolve));
  h.releaseTransaction();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.getRemoteKm(), 0,
    'Before the privileged seal, neither ordinary nor rapid UI edits may rewrite original Fleet');
  assert.equal(h.uploadCount(), 0, 'Preseal bridge must not even attempt an SDK write');
  assert.equal(h.getLocalKm(), 0, 'Rejected edits may not remain as phantom local Fleet state');
  assert.equal(h.pending(), false, 'Rejected preseal edits may not create an untrusted pending backup');
});

test('mismatched imported Fleet SHA never authorizes a write', async () => {
  const h = makeHarness({ importVerified: true, sourceShaMismatch: true });
  await h.login();
  assert.equal(h.isUnlocked(), true, 'Read-only Fleet UI should remain accessible');
  h.setKm(170);
  h.save();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.uploadCount(), 0, 'Wrong imported Fleet identity must not submit any writes');
  assert.equal(h.getRemoteKm(), 0);
});

test('missing server Fleet SHA after verification cannot be silently removed by a save', async () => {
  const h = makeHarness({ importVerified: true });
  await h.login();
  await new Promise(resolve => setImmediate(resolve));
  h.stripRemoteSha(); // Test-only simulated corruption after initial verification.
  h.setKm(150);
  h.save();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.getRemoteKm(), 0, 'Missing source SHA must abort before commit');
  assert.equal(h.pending(), false, 'Preseal edit is blocked before staging a pending write');
  assert.equal(h.getLocalKm(), 0, 'Original confirmed preseal data is restored after rejected edit');
});
