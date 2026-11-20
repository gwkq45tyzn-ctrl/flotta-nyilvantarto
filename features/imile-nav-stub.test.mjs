import assert from 'node:assert/strict';
import { navForSession, NAV_ITEMS } from './imile-nav-stub.mjs';
assert.equal(NAV_ITEMS.length, 3);
assert.equal(navForSession(false).length, 1);
assert.equal(navForSession(true).length, 3);
console.log('nav stub ok');
