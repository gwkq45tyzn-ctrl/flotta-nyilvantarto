import assert from 'node:assert/strict';

/**
 * Pure model of the fixed concurrent retry decision.
 * permission-denied is a conflict signal when the server revision has
 * advanced (or the UI is stale). Do not treat "server == UI" as a hard stop
 * on the first attempt, because a remote write may have already updated the UI.
 */
function shouldRetry(errorCode, attempt, serverRevision, localRevision) {
  if (!['permission-denied', 'aborted'].includes(errorCode)) return false;
  if (attempt >= 3) return false;
  if (serverRevision < localRevision && attempt > 0) return false;
  return true;
}

assert.equal(shouldRetry('permission-denied', 0, 3, 3), true, 'same revision still retries');
assert.equal(shouldRetry('permission-denied', 0, 3, 2), true, 'server ahead retries');
assert.equal(shouldRetry('permission-denied', 1, 2, 3), false, 'server behind after attempt is auth failure');
assert.equal(shouldRetry('aborted', 0, 3, 3), true);
assert.equal(shouldRetry('permission-denied', 3, 4, 3), false, 'budget exhausted');
assert.equal(shouldRetry('unauthenticated', 0, 3, 3), false);
console.log('concurrent retry decision test passed');
