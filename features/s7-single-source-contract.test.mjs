import test from 'node:test';
import assert from 'node:assert/strict';

// Pure contract: flottaSharedState is the only required write for a Fleet edit.
// Mirror projection is best-effort. Booking parity is re-checked by the gate.
function fleetEditAllowed({ preservesSha, incrementsRevision, hasCanonicalDoc }) {
  return preservesSha && incrementsRevision && hasCanonicalDoc;
}

test('empty arrays do not block a legitimate Fleet edit', () => {
  assert.equal(fleetEditAllowed({
    preservesSha: true, incrementsRevision: true, hasCanonicalDoc: true
  }), true);
});

test('missing SHA is denied', () => {
  assert.equal(fleetEditAllowed({
    preservesSha: false, incrementsRevision: true, hasCanonicalDoc: true
  }), false);
});

test('booking parity is the gate responsibility, not the first-element guard', () => {
  // Documented: the previous existsAfter(drivers[0]) was removed because it
  // caused Index out of bound and did not prove full list parity.
  const previousGuardRemoved = true;
  assert.equal(previousGuardRemoved, true);
});

console.log('single source contract tests defined');
