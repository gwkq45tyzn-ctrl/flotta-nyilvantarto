// Regression tests against the literal RE2-compatible patterns in firestore.rules.
// Source tests are NOT a replacement for Firebase Rules compiler or emulator.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const rules=readFileSync(new URL('./firestore.rules',import.meta.url),'utf8');
const dateSection=rules.slice(rules.indexOf('function validDay(value)'),rules.indexOf('function validEventTime(value, day)'));
const patterns=[...dateSection.matchAll(/value\.matches\('([^']+)'\)/g)].map(x=>new RegExp(x[1]));
assert.equal(patterns.length,4,'Expected explicit month length + leap-year validation');
const validDay=s=>patterns.some(re=>re.test(s));
let compared=0;
for(let year=1900;year<=2199;year++) {
 for(let month=1;month<=12;month++) {
  for(let day=1;day<=31;day++) {
   const str=[year,String(month).padStart(2,'0'),String(day).padStart(2,'0')].join('-');
   const date=new Date(Date.UTC(year,month-1,day));
   const expected=date.getUTCFullYear()===year && date.getUTCMonth()+1===month && date.getUTCDate()===day;
   assert.equal(validDay(str),expected,str);
   compared++;
  }
 }
}
for(const bad of ['2026-02-31','2026-04-31','2025-02-29','1900-02-29','2100-02-29','2026-00-01','2026-13-01','2026-10-00','2026-10-32','2026/10/30','bad'])
 assert.equal(validDay(bad),false,bad);
for(const good of ['2024-02-29','2000-02-29','1996-02-29','2026-10-30','2199-12-31'])
 assert.equal(validDay(good),true,good);
const timeSection=rules.slice(rules.indexOf('function validEventTime(value, day)'),rules.indexOf('function nonNegative(value, maximum)'));
const timeMatch=timeSection.match(/value\.matches\('\^' \+ day \+ '([^']+)'\)/);
assert.ok(timeMatch,'Expected event timestamp regex tied to eventDate');
const validEventTime=(text,day)=> validDay(day) && new RegExp('^'+day+timeMatch[1]).test(text);
for(const good of ['2026-10-30T00:00:00','2026-10-30T23:59:59','2026-10-30T09:05:03'])
 assert.equal(validEventTime(good,'2026-10-30'),true,good);
for(const bad of ['2026-10-30T99:99:99','2026-10-30T24:00:00','2026-10-30T12:60:00','2026-10-30T12:00:60','2026-10-29T12:00:00','2026-02-31T11:20:00'])
 assert.equal(validEventTime(bad,bad.slice(0,10)==='2026-02-31'?'2026-02-31':'2026-10-30'),false,bad);
assert.match(rules,/get\(userPath\(\)\)\.data\.role in \['admin','editor','viewer'\]/);
assert.match(rules,/allow read: if member\(\)/);
console.log('PASS: '+compared+' calendar dates, restricted attendance time and unknown-role guard (source-only)');
