import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
const res = spawnSync('node', ['features/migration-size-probe.mjs'], { encoding: 'utf8' });
assert.equal(res.status, 0);
assert.match(res.stdout, /"stop": false/);
console.log('size probe test passed');
