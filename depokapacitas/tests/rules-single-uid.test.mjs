/**
 * Single-UID rules contract test (pure, no emulator required).
 * Documents that email match alone is insufficient.
 * Run: node depokapacitas/tests/rules-single-uid.test.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';

const rules = fs.readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
assert.ok(rules.includes('REPLACE_WITH_REAL_SHARED_UID'), 'rules must contain the single-UID placeholder');
assert.ok(rules.includes('imilemanagement@imile-management-staging.firebaseapp.com'), 'rules must constrain the shared email');
assert.ok(rules.includes('flottaSharedState'), 'rules must protect the shared state collection');
assert.ok(!rules.includes('allow read, write: if true'), 'no open rules');
console.log('single-UID rules contract test passed');
