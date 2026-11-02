// Source contract for preserving physical inspection ticks ONLY on
// unchanged, server-trusted check-out lists during Firestore re-renders.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('./app.mjs',import.meta.url),'utf8');
const start=source.indexOf('function renderStaff(){');
const end=source.indexOf('function render(){',start);
assert.ok(start>=0&&end>start);
const render=source.slice(start,end);
const signature=render.indexOf('const signature=waiting.map(');
const snapshot=render.indexOf('const checkedCards=new Map()');
const rebuilt=render.indexOf("$('reviewList').innerHTML=");
const restore=render.indexOf('if(sameWaitingList&&canReview){',rebuilt);
assert.ok(signature>=0&&snapshot>signature&&rebuilt>snapshot&&restore>rebuilt,
 'Saved input state must be captured before DOM rebuild and restored after it');
assert.match(render,/const sameWaitingList=lastWaitingSignature===signature/);
assert.match(render,/if\(!sameWaitingList\)\{resetBulkApproval\(\);lastWaitingSignature=signature;\}/);
assert.match(render,/checkedCards\.set\(card\.dataset\.session,new Set\(checked\)\)/);
assert.match(render,/input\.checked=checked\.has\(input\.dataset\.check\)/);
assert.match(render,/if\(!sourcesTrusted\(STAFF_SOURCES\)\)\{\s*resetBulkApproval\(\)/);
assert.match(source,/lastWaitingSignature='';resetBulkApproval\(\)/);
assert.match(source,/show\('bulkPanel',canReview&&waiting\.length>0\)/);
console.log('PASS: review selections survive harmless snapshots but reset after source or session changes');
