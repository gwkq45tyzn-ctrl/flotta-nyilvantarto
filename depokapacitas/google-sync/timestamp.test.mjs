import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const gs=readFileSync(new URL('./Code.gs',import.meta.url),'utf8');
const start=gs.indexOf('function formatDisplayTimestamp(s){');
const end=gs.indexOf('function installFiveMinuteTrigger(){',start);
assert.ok(start>=0 && end>start,'Missing timestamp parser in Google Apps Script');
const formatDisplayTimestamp=new Function(gs.slice(start,end)+'return formatDisplayTimestamp;')();
const pairs=[
 ['10/30/2026 06:45:02','2026-10-30T06:45:02'],
 ['10/30/2026 6:05 PM','2026-10-30T18:05:00'],
 ['10/30/2026 12:00 AM','2026-10-30T00:00:00'],
 ['10/30/2026 12:00 PM','2026-10-30T12:00:00'],
 ['02/30/2026 06:05',''],
 ['10/30/2026',''],
 ['10/30/2026 25:07',''],
 ['10/30/2026 11:72',''],
 ['10/30/2026 08:04 AM','2026-10-30T08:04:00'],
 ['1/9/2026, 7:05 PM','2026-01-09T19:05:00'],
];
for(const [input,expected] of pairs)assert.equal(formatDisplayTimestamp(input),expected,input);
assert.ok(gs.includes('timeKnown:known||Boolean(fallback)'),'Unknown time state for fallback timestamps');
console.log('PASS: Google Attendance timestamp fallback parser and known time state');
