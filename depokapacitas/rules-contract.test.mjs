// Static security regression checks only: NOT a Firestore emulator or a deployment test.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const rules=readFileSync(new URL('./firestore.rules',import.meta.url),'utf8');
assert.match(rules,/match \/\{path=\*\*\} \{ allow read, write: if false;/);
assert.match(rules,/function member\(\)/);
assert.match(rules,/get\(userPath\(\)\)\.data\.active == true/);
assert.match(rules,/match \/drivers\/\{driverId\}/);
assert.match(rules,/request\.resource\.data\.daCode == driverId/);
assert.match(rules,/request\.resource\.data\.active is bool/);
assert.match(rules,/match \/vehicles\/\{vehicleId\}/);
assert.match(rules,/request\.resource\.data\.plate == vehicleId/);
assert.match(rules,/function declaredDriverCapacity\(driverId\)/);
assert.match(rules,/request\.resource\.data\.capacity == declaredDriverCapacity\(request\.resource\.data\.driverId\)/);
assert.match(rules,/get\(\/databases\/\$\(database\)\/documents\/drivers\/\$\(request\.resource\.data\.driverId\)\)\.data\.active == true/);
assert.match(rules,/get\(\/databases\/\$\(database\)\/documents\/vehicles\/\$\(request\.resource\.data\.vehicleId\)\)\.data\.status == 'Elérhető'/);
assert.match(rules,/allow update: if false;/);
assert.doesNotMatch(rules,/allow\s+read,\s*write:\s*if\s*true/);
console.log('PASS: static Firestore rules contract (not an emulator test)');
