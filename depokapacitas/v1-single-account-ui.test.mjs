import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const app=readFileSync(new URL('./app.js',import.meta.url),'utf8');
const html=readFileSync(new URL('./index.html',import.meta.url),'utf8');
const rule=readFileSync(new URL('./firestore-v1-restricted.rules',import.meta.url),'utf8');

assert.match(html,/data-view="admin" id="adminNav" hidden>⚙ <span>Flotta import ellenőrzése<\/span>/);
assert.match(app,/admin:'Flotta import ellenőrzése'/);
assert.match(app,/function admin\(\).*?const legacyCompare=section\('Közös törzsadatok ellenőrzése/s);
assert.match(app,/A V1 az egyetlen meglévő imilemanagement Firebase-fiókot használja/);
assert.doesNotMatch(app,/frm\('user'/);
assert.doesNotMatch(app,/get\('users'\)\.map/);
assert.doesNotMatch(app,/state\.role==='admin'\?\['users'\]:\[\]/);
assert.match(app,/else if\(type==='user'\)\{throw Error\('V1-ben kizárólag/);
assert.match(rule,/match \/users\/\{uid\} \{[\s\S]*?allow list, create, update, delete: if false;/);
assert.match(rule,/function courier\(\) \{[\s\S]*?return false;/);
console.log('PASS: V1 one shared login, local read-only backup tool preserved, user CRUD/collection enumeration disabled');
