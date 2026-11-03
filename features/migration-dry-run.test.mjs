import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
const res = spawnSync('node', ['features/migration-dry-run.mjs'], { encoding: 'utf8' });
assert.equal(res.status, 0);
assert.match(res.stdout, /"vehicles": 1/);
assert.match(res.stdout, /"over": false/);
console.log('dry-run test passed');
