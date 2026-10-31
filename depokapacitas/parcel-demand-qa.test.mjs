import assert from 'node:assert/strict';import fs from 'node:fs';import {runSyntheticDemandQa,QA_SCENARIOS} from './parcel-demand-qa.mjs';
const expected=['preview-match','preview-differences','preview-differences','preview-differences','preview-differences','blocked','source-untrusted'];
for(const [i,s]of QA_SCENARIOS.entries()){const r=runSyntheticDemandQa(s);assert.equal(r.comparison.status,expected[i]);assert.equal(r.syntheticOnly,true);assert.equal(r.comparison.writesAllowed,false);assert.equal(r.comparison.authoritative,false);assert.doesNotMatch(JSON.stringify(r.comparison),/SYN_QA_000/);}
assert.throws(()=>runSyntheticDemandQa('real-source'));
assert.equal(runSyntheticDemandQa('missing-parcel').comparison.totals.previewNew,null);
const ui=fs.readFileSync(new URL('./parcel-preview-app.mjs',import.meta.url),'utf8');
assert.match(ui,/if\(!allowed\)return;/);assert.match(ui,/\$\('comparisonQa'\)\.hidden=true/);
assert.match(ui,/runSyntheticDemandQa\(\$\('qaScenario'\)\.value\)/);
assert.doesNotMatch(ui,/\b(?:setDoc|updateDoc|deleteDoc|writeBatch|runTransaction|addDoc)\s*\(/);
const core=fs.readFileSync(new URL('./parcel-demand-qa.mjs',import.meta.url),'utf8');assert.doesNotMatch(core,/firebase|fetch\s*\(/i);
console.log('PASS: 7 built-in synthetic scenarios, unknown source blocked, read-only UI gate and no IDs in comparison');
