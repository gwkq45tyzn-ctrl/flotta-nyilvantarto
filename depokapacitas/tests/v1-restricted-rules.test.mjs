import assert from 'node:assert/strict';
import fs from 'node:fs';
const rules = fs.readFileSync(new URL('../firestore-v1-restricted.rules', import.meta.url), 'utf8');
assert.ok(rules.includes('REPLACE_WITH_REAL_SHARED_UID'));
assert.ok(rules.includes('V1-RESTRICTED CANDIDATE'));
assert.ok(rules.includes('match /{path=**} { allow read, write: if false; }'));
// Courier paths exist in the file but signedIn() is single-UID only, so they are effectively deferred.
assert.ok(rules.includes('courierAccess') || rules.includes('photoReceipts'));
console.log('v1-restricted rules contract passed');
