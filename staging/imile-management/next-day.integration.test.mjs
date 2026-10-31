import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const app=read('../../depokapacitas/app.js');
const core=read('../../depokapacitas/next-day-forecast.mjs');
const preview=read('./build-preview.mjs');
const workflow=read('../../.github/workflows/imile-staging.yml');

assert.match(app,/import \{prepareNextDay\} from '\.\/next-day-forecast\.mjs'/);
assert.match(app,/function nextDayPanel\(\)/);
assert.match(app,/sourcesReady:\['demands','bookings','drivers','vehicles'\]\.every/);
assert.match(app,/return datebar\(\)\+nextDayPanel\(\)\+centralTaskList\(8\)/);
assert.match(app,/return datebar\(\)\+nextDayPanel\(\)\+centralTaskList\(5\)/);
assert.match(app,/Visszaigazolt kapacitás/);
assert.match(app,/Megerősített eltérés/);
assert.match(preview,/'depokapacitas\/next-day-forecast\.mjs'/);
assert.match(workflow,/next-day-forecast\.test\.mjs/);
assert.doesNotMatch(core,/\b(?:setDoc|updateDoc|deleteDoc|writeBatch|runTransaction|UrlFetchApp|SpreadsheetApp)\s*\(/);
console.log('PASS: next-day UI, staging preview and CI wireup stay read-only');
