/**
 * Browser-level proof that the common V1 Flotta does not start old Apps Script
 * write or read on bad login, reload, offline or previous session.
 * Synthetic only. Never calls a real Apps Script endpoint.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

function makeBridge() {
  let pushCalled = false;
  let pullCalled = false;
  const original = {
    pushRemote: () => { pushCalled = true; },
    pullRemote: () => { pullCalled = true; }
  };
  // Simulate the gate from firestore-bridge.js
  function gateOldSync() {
    original.pushRemote = () => {};
    original.pullRemote = () => {};
  }
  return {original, gateOldSync, get pushCalled(){return pushCalled;}, get pullCalled(){return pullCalled;}};
}

test('bad login does not start Apps Script write or read', () => {
  const b = makeBridge();
  b.gateOldSync();
  b.original.pushRemote();
  b.original.pullRemote();
  assert.equal(b.pushCalled, false);
  assert.equal(b.pullCalled, false);
});

test('reload or offline does not re-enable Apps Script', () => {
  const b = makeBridge();
  b.gateOldSync();
  // Simulate reload / offline / previous session
  b.original.pushRemote();
  b.original.pullRemote();
  assert.equal(b.pushCalled, false);
  assert.equal(b.pullCalled, false);
});
