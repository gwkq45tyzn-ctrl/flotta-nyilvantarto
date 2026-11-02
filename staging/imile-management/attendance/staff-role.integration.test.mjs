// Viewer may inspect vehicles and photos, but must never be offered a
// working return confirmation. Firestore Rules emulator enforces this too.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('./app.mjs',import.meta.url),'utf8');
assert.match(app,/const canReviewVehicles=\(\)=>isStaff&&\['admin','editor'\]\.includes\(staffRole\)/);
const part=(start,end)=>{
 const a=app.indexOf(start),b=app.indexOf(end,a+start.length);
 assert.ok(a>=0&&b>a,'Boundary missing '+start);
 return app.slice(a,b);
};
const list=part('function renderStaff(){','function render(){');
assert.match(list,/const canReview=canReviewVehicles\(\)/);
assert.match(list,/\(canReview\?'<div class="checks">/);
assert.match(list,/show\('bulkPanel',canReview&&waiting\.length>0\)/);
assert.match(list,/Csak jogosult depóvezető vagy szerkesztő/);
const one=part('async function reviewOne(', "$('loginForm').addEventListener");
assert.ok(one.indexOf('if(!canReviewVehicles())')<one.indexOf('runTransaction(db'),
 'A viewer must be denied BEFORE a manager transaction starts');
const single=part("$('reviewList').addEventListener","$('bulkReview').addEventListener");
assert.match(single,/if\(!canReviewVehicles\(\)\)return toast/);
const bulk=part("$('bulkReview').addEventListener","document.addEventListener('visibilitychange'");
assert.match(bulk,/if\(!canReviewVehicles\(\)\)return toast/);
console.log('PASS: viewers cannot open individual or bulk vehicle-return controls');
