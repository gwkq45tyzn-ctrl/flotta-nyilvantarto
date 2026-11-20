import test from 'node:test';
import assert from 'node:assert/strict';

// Pure model of the hard-stop: a Flotta update that does not also project
// the masters in the same transaction must be rejected by rules.
function flottaUpdateAllowed({ preservesSha, incrementsRevision, projectsMasters }) {
  return preservesSha && incrementsRevision && projectsMasters;
}

test('independent edit that skips projection is denied', () => {
  assert.equal(flottaUpdateAllowed({
    preservesSha: true, incrementsRevision: true, projectsMasters: false
  }), false);
});

test('atomic projection is allowed', () => {
  assert.equal(flottaUpdateAllowed({
    preservesSha: true, incrementsRevision: true, projectsMasters: true
  }), true);
});

test('missing SHA is denied', () => {
  assert.equal(flottaUpdateAllowed({
    preservesSha: false, incrementsRevision: true, projectsMasters: true
  }), false);
});

console.log('independent edit hard-stop tests defined');
