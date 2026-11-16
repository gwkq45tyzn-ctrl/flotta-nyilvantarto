import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// Exercise the ACTUAL original complete index.html JSON import handler, not a
// reimplementation. No server, Firebase, credentials or private Fleet data.
const html=readFileSync(new URL('../../../index.html',import.meta.url),'utf8');
const begin=html.indexOf('    function importData(e) {');
const end=html.indexOf('    // Init: never fetch fleet data before a login session exists.',begin);
assert.ok(begin>0&&end>begin,'Original JSON import handler source anchors changed');
const source=html.slice(begin,end);
const bridge=readFileSync(new URL('../../../features/firestore-bridge.js',import.meta.url),'utf8');
const fullRich=()=>({
  vehicles:[
    {id:'vehicle-1',rendszam:'ABC-123',status:'aktiv',
      km:37891,history:[{type:'service',nested:{note:'KEEP_VEHICLE_RICH'}}]}
  ],
  drivers:[{id:'driver-1',daCode:'DA0001',status:'aktiv',kapacitas:70,
    history:[{type:'work',nested:{note:'KEEP_DRIVER_RICH'}}]}],
  fuelCards:[{id:'fuel-1',number:'QA-FUEL-CARD',history:[{note:'KEEP_FUEL_RICH'}]}],
  contacts:[{id:'contact-1',phone:'QA-PHONE',future:{history:['KEEP_CONTACT_RICH']}}]
});
function harness({approve=true}={}){
  const events={saves:0,refreshes:0,prompts:0,messages:[]};
  class Reader {
    readAsText(file){this.result=file.content;this.onload();}
  }
  const make=new Function('initial','FileReader','confirm','alert','events',
    'let vehicles=structuredClone(initial.vehicles);'+
    'let fuelCards=structuredClone(initial.fuelCards);'+
    'let drivers=structuredClone(initial.drivers);'+
    'let contacts=structuredClone(initial.contacts);'+
    'const save=()=>{events.saves++}; const refresh=()=>{events.refreshes++};'+
    source+
    '\nreturn {importData,get:()=>({vehicles,drivers,fuelCards,contacts})};');
  const state=make(fullRich(),Reader,()=>{events.prompts++;return approve;},
    message=>events.messages.push(message),events);
  const run=value=>{
    const input={files:[{content:typeof value==='string'?value:JSON.stringify(value)}],value:'selected'};
    state.importData({target:input});
    assert.equal(input.value,'','File selection must be reset after a local attempt');
    return state.get();
  };
  return {state,events,run};
}

test('valid complete rich 4-array backup is loaded ONLY after confirmation',()=>{
  const h=harness();
  const replacement=fullRich();
  replacement.vehicles[0].history[0].nested.note='NEW_RICH_VEHICLE';
  replacement.fuelCards[0].history[0].note='NEW_RICH_CARD';
  replacement.contacts[0].future.history.push('NEW_CONTACT');
  const result=h.run(replacement);
  assert.deepEqual(result,replacement);
  assert.equal(h.events.prompts,1);
  assert.equal(h.events.saves,1);
  assert.equal(h.events.refreshes,1);
  assert.match(h.events.messages.at(-1),/négytömbös/);
});
test('cancelled complete import does not mutate in-memory arrays, even briefly',()=>{
  const h=harness({approve:false}),before=structuredClone(h.state.get());
  const replacement=fullRich();
  replacement.vehicles[0].km=999999;
  replacement.drivers[0].kapacitas=1;
  replacement.contacts[0].phone='SHOULD_NOT_REPLACE';
  const after=h.run(replacement);
  assert.deepEqual(after,before);
  assert.equal(h.events.prompts,1);
  assert.equal(h.events.saves,0);
  assert.equal(h.events.refreshes,0);
  assert.equal(h.events.messages.length,0);
});
for(const kind of ['drivers','fuelCards','contacts']){
 test('missing '+kind+' array refuses before confirmation; original data stays intact',()=>{
   const h=harness(),before=structuredClone(h.state.get()),bad=fullRich();
   delete bad[kind];
   assert.deepEqual(h.run(bad),before);
   assert.equal(h.events.prompts,0);
   assert.equal(h.events.saves,0);
   assert.match(h.events.messages[0],/Importálás elutasítva/);
 });
}
test('single vehicles-only legacy JSON array must never erase drivers/cards/contacts',()=>{
 const h=harness(),before=structuredClone(h.state.get());
 assert.deepEqual(h.run(fullRich().vehicles),before);
 assert.equal(h.events.prompts,0);
 assert.equal(h.events.saves,0);
});
test('malformed JSON does not modify any of the original rich arrays',()=>{
 const h=harness(),before=structuredClone(h.state.get());
 assert.deepEqual(h.run('{broken-json'),before);
 assert.equal(h.events.prompts,0);
 assert.equal(h.events.saves,0);
});
test('invalid nested history blocks import without losing rich data',()=>{
 const h=harness(),before=structuredClone(h.state.get()),bad=fullRich();
 bad.vehicles[0].history='not-an-array';
 assert.deepEqual(h.run(bad),before);
 assert.equal(h.events.saves,0);
});
test('empty drivers or vehicles cannot clear fleet from import',()=>{
 for(const key of ['vehicles','drivers']){
   const h=harness(),before=structuredClone(h.state.get()),bad=fullRich();
   bad[key]=[];
   assert.deepEqual(h.run(bad),before);
   assert.equal(h.events.saves,0);
 }
});
test('duplicate normalized plates, DA IDs and importer reserved sourceIndex DENY',()=>{
 const bads=[];
 let p=fullRich();p.vehicles.push({...p.vehicles[0],id:'vehicle-2',rendszam:'abc 123'});bads.push(p);
 p=fullRich();p.drivers.push({...p.drivers[0],id:'driver-2',daCode:'da0001'});bads.push(p);
 p=fullRich();p.vehicles[0].sourceIndex=0;bads.push(p);
 p=fullRich();p.drivers[0].id='';bads.push(p);
 p=fullRich();p.migrationSourceSha256='a'.repeat(64);bads.push(p);
 for(const bad of bads){
   const h=harness(),before=structuredClone(h.state.get());
   assert.deepEqual(h.run(bad),before);
   assert.equal(h.events.prompts,0);
   assert.equal(h.events.saves,0);
 }
});
test('integrated Fleet bridge forbids bulk JSON import even POSTSEAL',()=>{
  assert.match(bridge,/JSON bulk import is a PRIVILEGED MIGRATION/);
  assert.match(bridge,/window\.importData=function\(event\)/);
  assert.match(bridge,/A közös Flotta közvetlen JSON-importja letiltva/);
  assert.match(bridge,/event\.stopImmediatePropagation\(\)/);
  // The wrapper is outside the allowed/sealed conditional, so a successful
  // seal must not silently turn the legacy bulk-import handler back on.
  const start=bridge.indexOf('if(typeof window.importData');
  const stop=bridge.indexOf('\n  }\n\n  function patchSave()',start);
  assert.ok(start>0&&stop>start);
  assert.doesNotMatch(bridge.slice(start,stop),/lastSealedSource|allowed\(\)/);
});
