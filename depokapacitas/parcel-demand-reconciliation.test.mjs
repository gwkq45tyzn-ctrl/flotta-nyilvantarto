import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compareParcelPreviewToDemands as compare} from './parcel-demand-reconciliation.mjs';
import {previewParcelImport} from './parcel-preview.mjs';
import {adaptParcelSource} from './parcel-source-adapter.mjs';
const date='2099-02-01';
const health={status:'ready',trusted:true,confirmedAt:4073587200000};
const row=(id,patch={})=>({date,trackingId:id,district:'IX.',kind:'new',...patch});
const p=(rows)=>previewParcelImport(JSON.stringify(rows),{date,format:'json'});
const demand=(district='IX.',newCount=1,retryCount=0)=>({date,district,newCount,retryCount});
const check=(preview,demands,opts={})=>compare(preview,demands,
 {date,sourceHealth:health,districtMode:'legacy-preview',...opts});
let passed=0;
function test(name,fn){try{fn();passed++;}catch(error){throw Error(name+': '+error.message,{cause:error});}}

test('verified parcel preview matches exact district demand',()=>{
 const r=check(p([row('A'),row('B',{kind:'retry'})]),[demand('IX.',1,1)]);
 assert.equal(r.status,'preview-match');assert.equal(r.matchCount,1);
 assert.equal(r.totals.previewNew,1);assert.equal(r.totals.planRetry,1);
 assert.equal(r.writesAllowed,false);assert.equal(r.authoritative,false);
});
test('difference for new and retry counts is separately calculated',()=>{
 const r=check(p([row('A'),row('B',{kind:'retry'})]),[demand('IX.',2,0)]);
 assert.equal(r.status,'preview-differences');assert.equal(r.rows[0].newDelta,-1);
 assert.equal(r.rows[0].retryDelta,1);
});
test('duplicates in manifest count only once',()=>{
 const r=check(p([row('A'),row('A')]),[demand('IX.',1,0)]);
 assert.equal(r.status,'preview-match');assert.equal(r.totals.previewNew,1);
});
test('conflicting manifest blocks every aggregate',()=>{
 const r=check(p([row('A'),row('A',{kind:'retry'})]),[demand('IX.',1,0)]);
 assert.equal(r.status,'blocked');assert.equal(r.totals,null);
 assert.deepEqual(r.rows,[]);
});
test('no parcel input means unknown not zero',()=>{
 const r=check(p([]),[demand('IX.',0,0)]);
 assert.equal(r.status,'blocked');assert.equal(r.totals,null);
});
test('explicit zero in plan does not imply an empty manifest',()=>{
 const r=check(p([row('A')]),[demand('IX.',0,0)]);
 assert.equal(r.status,'preview-differences');assert.equal(r.rows[0].newDelta,1);
});
test('missing plan district remains unknown, no zero substitution',()=>{
 const r=check(p([row('A')]),[]);
 assert.equal(r.rows[0].status,'missing_plan_district');
 assert.equal(r.rows[0].planNew,null);assert.equal(r.rows[0].newDelta,null);
 assert.equal(r.totals.planNew,null);
});
test('plan district absent from parcel list is not a verified zero',()=>{
 const r=check(p([row('A')]),[demand('IX.'),demand('X.',0,0)]);
 assert.equal(r.status,'preview-differences');
 assert.equal(r.rows.find(x=>x.district==='X.').status,'missing_parcel_district');
});
test('duplicate demand entries blocked from matching',()=>{
 const r=check(p([row('A')]),[demand(),demand()]);
 assert.equal(r.rows[0].status,'duplicate_plan_district');
 assert.equal(r.rows[0].planNew,null);
 assert.equal(r.totals.planNew,null);
});
for(const value of [-1,'1',1.5,null,undefined,10000001]){
 test('invalid demand cannot match '+String(value),()=>{
  const r=check(p([row('A')]),[demand('IX.',value,0)]);
  assert.equal(r.rows[0].status,'invalid_plan_counts');
  assert.equal(r.rows[0].planNew,null);
 });
}
test('other day demand does not enter selected day',()=>{
 const r=check(p([row('A')]),[{...demand(),date:'2099-02-02'}]);
 assert.equal(r.rows[0].status,'missing_plan_district');
});
test('invalid comparison day blocks',()=>{
 const r=check(p([row('A')]),[demand()],{date:'2099-02-30'});
 assert.equal(r.status,'blocked');
});
test('preview day mismatched blocks',()=>{
 const r=check(p([row('A')]),[demand()],{date:'2099-02-02'});
 assert.equal(r.status,'blocked');
});
test('district mode must be explicit',()=>{
 const r=compare(p([row('A')]),[demand()],{date,sourceHealth:health});
 assert.equal(r.status,'blocked');assert.equal(r.issues[0].reason,'district_equivalence_unapproved');
});
test('legacy district mode reconciles slash with dash only if explicitly selected',()=>{
 const original=p([row('A',{district:'IX/A'})]);
 const r=check(original,[demand('ix-a')]);
 assert.equal(r.status,'preview-match');
 assert.equal(check(original,[demand('ix-a')],{districtMode:'exact'}).status,'preview-differences');
});
test('duplicate normalized district in preview blocked',()=>{
 const preview=p([row('A')]);preview.districts.push({...preview.districts[0]});
 const r=check(preview,[demand()]);
 assert.equal(r.status,'blocked');assert.equal(r.totals,null);
});
test('parcel aggregate total mismatch blocked',()=>{
 const preview=p([row('A')]);preview.uniqueCount=2;
 const r=check(preview,[demand()]);
 assert.equal(r.status,'blocked');
});
test('unsupported preview object cannot become trusted',()=>{
 const r=check({status:'preview',districts:[{district:'IX.',newCount:1,retryCount:0}]},[demand()]);
 assert.equal(r.status,'blocked');
});
test('missing demands is unknown not empty demand',()=>{
 const r=check(p([row('A')]),undefined);
 assert.equal(r.status,'blocked');
});
test('untrusted source states hide results',()=>{
 for(const status of ['cached','pending','error','loading','stale','offline']){
  const r=check(p([row('A')]),[demand()],{sourceHealth:{...health,status,trusted:false}});
  assert.equal(r.status,'source-untrusted');
  assert.deepEqual(r.rows,[]);assert.equal(r.totals,null);
 }
});
test('trusted flag without server receipt time still blocked',()=>{
 const r=check(p([row('A')]),[demand()],
  {sourceHealth:{status:'ready',trusted:true,confirmedAt:null}});
 assert.equal(r.status,'source-untrusted');
});
test('trust no longer present means no results',()=>{
 const r=check(p([row('A')]),[demand()],{sourceHealth:undefined});
 assert.equal(r.status,'source-untrusted');
});
test('the #8 explicit mapped adapter can be compared without exposing IDs',()=>{
 const config={sourceSchemaId:'SYNTHETIC_QA_V1',
  columns:{date:'WorkDay',trackingId:'AWBText',district:'Zone',kind:'ParcelType'},
  kindValues:{new:['N'],retry:['R']},
  identityMode:'exact',identityWhitespace:'preserve',districtMode:'exact'};
 const adapted=adaptParcelSource([{WorkDay:date,AWBText:'0001',Zone:'IX.',ParcelType:'N'}],
  {selectedDate:date,config});
 assert.equal(adapted.status,'preview');
 const r=check(adapted,[demand()]);
 assert.equal(r.status,'preview-match');assert.equal(r.authoritative,false);
 assert.doesNotMatch(JSON.stringify(r),/0001/);
});
test('separate source map with different day is blocked',()=>{
 const config={sourceSchemaId:'SYNTHETIC_QA_V1',
  columns:{date:'WorkDay',trackingId:'AWBText',district:'Zone',kind:'ParcelType'},
  kindValues:{new:['N'],retry:['R']},
  identityMode:'exact',identityWhitespace:'preserve',districtMode:'exact'};
 const adapted=adaptParcelSource([{WorkDay:'2099-02-02',AWBText:'0001',Zone:'IX.',ParcelType:'N'}],
  {selectedDate:'2099-02-02',config});
 const r=check(adapted,[demand()]);
 assert.equal(r.status,'blocked');assert.equal(r.totals,null);
});
test('the comparator has no Firebase writes or implicit browser UI integration',()=>{
 const text=readFileSync(new URL('./parcel-demand-reconciliation.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(text,/\b(?:setDoc|updateDoc|deleteDoc|writeBatch|runTransaction|addDoc)\b/);
 assert.doesNotMatch(text,/fetch\s*\(/);
});
console.log('PASS: '+passed+' read-only district demand comparison, source trust, unknowns and adapter cases');
