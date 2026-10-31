import assert from 'node:assert/strict';
import {adaptParcelSource} from './parcel-source-adapter.mjs';

const date='2026-11-02';
const config={
  sourceSchemaId:'SYNTHETIC_QA_V1',
  columns:{date:'WorkDay',trackingId:'AWBText',district:'Zone',kind:'DeliveryKind'},
  kindValues:{new:['N'],retry:['R']},
  identityMode:'exact',identityWhitespace:'preserve',districtMode:'exact'
};
const row=(id,extra={})=>({WorkDay:date,AWBText:id,Zone:'IX.',DeliveryKind:'N',...extra});
const adapt=(data,patch={})=>adaptParcelSource(data,{config,selectedDate:date,...patch});
let n=0;
function test(label,fn){try{fn();n++;}catch(e){throw Error(label+': '+e.message,{cause:e});}}

test('explicit schema permits local preview only',()=>{
  const r=adapt([row('001'),row('002',{DeliveryKind:'R'})]);
  assert.equal(r.status,'preview');
  assert.equal(r.importAllowed,false);
  assert.equal(r.uniqueCount,2);
  assert.deepEqual(r.districts,[{district:'IX.',newCount:1,retryCount:1}]);
});
test('no mapping is always blocked',()=>{
  const r=adaptParcelSource([row('001')]);
  assert.equal(r.status,'blocked');
  assert.equal(r.uniqueCount,null);
  assert.equal(r.issues[0].reason,'mapping_missing');
});
test('missing real source column is blocked',()=>{
  const r=adapt([row('001')],{availableHeaders:['WorkDay','AWBText','Zone','Other']});
  assert.equal(r.issues[0].reason,'source_header_not_matched');
});
test('no source rows means unknown, not zero',()=>{
  const r=adapt([],{availableHeaders:['WorkDay','AWBText','Zone','DeliveryKind']});
  assert.equal(r.status,'missing');
  assert.equal(r.uniqueCount,null);
});
test('explicit zero rows on selected day is missing',()=>{
  const r=adapt([row('001',{WorkDay:'2026-11-03'})],{selectedDate:date});
  assert.equal(r.status,'missing');assert.equal(r.uniqueCount,null);
});
test('zero retention of copied source rows',()=>{
  const inputs=[row('001'),row('001',{Zone:'X.'})];
  const before=JSON.stringify(inputs);
  adapt(inputs);
  assert.equal(JSON.stringify(inputs),before);
});
test('identical duplicate counts once',()=>{
  const r=adapt([row('001'),row('001')]);
  assert.equal(r.status,'preview');assert.equal(r.uniqueCount,1);assert.equal(r.duplicates,1);
});
test('mismatched district blocks all outputs',()=>{
  const r=adapt([row('001'),row('001',{Zone:'X.'})]);
  assert.equal(r.status,'blocked');assert.equal(r.uniqueCount,null);
  assert.deepEqual(r.canonicalRows,[]);assert.deepEqual(r.districts,[]);
  assert.deepEqual(r.issues,[{reason:'conflicting_tracking_identity',line:3,relatedLine:2}]);
});
test('mismatched new retry blocks all outputs',()=>{
  const r=adapt([row('001'),row('001',{DeliveryKind:'R'})]);
  assert.equal(r.status,'blocked');assert.equal(r.issues[0].reason,'conflicting_tracking_identity');
});
test('same ID on another day is independent',()=>{
  const rows=[row('001'),row('001',{WorkDay:'2026-11-03',DeliveryKind:'R'})];
  const monday=adapt(rows,{selectedDate:date});
  const tuesday=adapt(rows,{selectedDate:'2026-11-03'});
  assert.equal(monday.status,'preview');assert.equal(monday.uniqueCount,1);
  assert.equal(tuesday.status,'preview');assert.equal(tuesday.uniqueCount,1);
  assert.equal(tuesday.districts[0].retryCount,1);
});
test('selected day is mandatory for safe daily aggregates',()=>{
  const r=adaptParcelSource([row('001')],{config});
  assert.equal(r.status,'blocked');assert.equal(r.uniqueCount,null);
  assert.equal(r.issues[0].reason,'selected_day_required');
});
test('selected day excludes other dates',()=>{
  const r=adapt([row('001'),row('001',{WorkDay:'2026-11-03',DeliveryKind:'R'})],{selectedDate:date});
  assert.equal(r.uniqueCount,1);assert.equal(r.excludedRows,1);
});
test('preserved case treats distinct IDs as distinct',()=>{
  const r=adapt([row('ab'),row('AB')]);
  assert.equal(r.uniqueCount,2);
});
test('approved uppercase mode collapses case',()=>{
  const r=adapt([row('ab'),row('AB')],{config:{...config,identityMode:'uppercase'}});
  assert.equal(r.uniqueCount,1);assert.equal(r.duplicates,1);
});
test('unconfirmed identity mode blocked',()=>{
  const r=adapt([row('ab')],{config:{...config,identityMode:'unknown'}});
  assert.equal(r.status,'blocked');assert.equal(r.issues[0].reason,'identity_policy_unconfirmed');
});
test('explicit whitespace semantics required',()=>{
  const a=adapt([row(' 001 ')]);assert.equal(a.status,'blocked');
  const b=adapt([row(' 001 ')],{config:{...config,identityWhitespace:'trim'}});
  assert.equal(b.status,'preview');assert.equal(b.canonicalRows[0].trackingId,'001');
});
test('leading zeros survive',()=>{
  const r=adapt([row('001'),row('1')]);assert.equal(r.uniqueCount,2);
});
test('numeric IDs are invalid, never stringified',()=>{
  const r=adapt([row('001'),row(1)]);assert.equal(r.status,'blocked');
  assert.equal(r.issues[0].reason,'non_text_source_cell');
});
test('unapproved kind always blocked',()=>{
  const r=adapt([row('001',{DeliveryKind:'Unknown'})]);
  assert.equal(r.status,'blocked');assert.equal(r.issues[0].reason,'invalid_mapped_value');
});
test('colliding source kind labels blocked',()=>{
  const r=adapt([row('001')],{config:{...config,kindValues:{new:['N'],retry:['N']}}});
  assert.equal(r.status,'blocked');assert.equal(r.issues[0].reason,'kind_mapping_ambiguous');
});
test('column aliases not auto-inferred',()=>{
  const r=adapt([{Date:date,AWB:'001',District:'IX.',Type:'N'}]);
  assert.equal(r.status,'blocked');
});
test('same source mapped twice blocked',()=>{
  const r=adapt([row('001')],{config:{...config,columns:{...config.columns,kind:'AWBText'}}});
  assert.equal(r.issues[0].reason,'column_mapping_collision');
});
test('invalid calendar date blocked',()=>{
  const r=adapt([row('001',{WorkDay:'2026-02-29'})]);
  assert.equal(r.status,'blocked');assert.equal(r.uniqueCount,null);
});
test('unknown date format blocked not guessed',()=>{
  const r=adapt([row('001',{WorkDay:'11/02/2026'})]);
  assert.equal(r.status,'blocked');
});
test('bad selected date blocked',()=>{
  const r=adapt([row('001')],{selectedDate:'2026-11-31'});
  assert.equal(r.status,'blocked');assert.equal(r.issues[0].reason,'invalid_selected_day');
});
test('missing row field blocks entire file',()=>{
  const bad=row('002');delete bad.AWBText;
  const r=adapt([row('001'),bad]);
  assert.equal(r.status,'blocked');assert.equal(r.issues[0].line,3);
});
test('very long ID blocked',()=>{
  const r=adapt([row('a'.repeat(101))]);assert.equal(r.status,'blocked');
});
test('max rows bounded',()=>{
  const r=adapt(Array.from({length:5001},(_,i)=>row('X'+i)));
  assert.equal(r.status,'blocked');assert.equal(r.issues[0].reason,'invalid_or_oversized_input');
});
test('invalid column headers blocked',()=>{
  const r=adapt([row('001')],{availableHeaders:['WorkDay','AWBText','Zone','DeliveryKind','Zone']});
  assert.equal(r.status,'blocked');assert.equal(r.issues[0].reason,'invalid_source_headers');
});
test('district case mode is explicit',()=>{
  const r=adapt([row('001',{Zone:'ix.'})],{config:{...config,districtMode:'uppercase'}});
  assert.equal(r.status,'preview');assert.equal(r.districts[0].district,'IX.');
});
test('versioned source schema is mandatory',()=>{
  const r=adapt([row('001')],{config:{...config,sourceSchemaId:''}});
  assert.equal(r.issues[0].reason,'source_schema_id_missing');
});
console.log('PASS: '+n+' explicit source mapping, case semantics, dedupe, fail-closed, no-write contract cases');
