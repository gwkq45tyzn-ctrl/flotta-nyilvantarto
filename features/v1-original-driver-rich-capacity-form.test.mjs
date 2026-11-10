/**
 * Regression on the REAL original index.html saveDriver() function,
 * not a reimplementation. Protects rich migrated fields/history and the
 * daily parcel capacity needed for Flotta → Depot planning.
 * Synthetic in-memory DOM; no Firebase or production network.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const html=readFileSync('index.html','utf8');
const a=html.indexOf('    function saveDriver(e) {');
const b=html.indexOf('\n    function editDriver',a);
assert.ok(a>0&&b>a,'Original saveDriver anchor missing');
const originalFunction=html.slice(a,b);
function form(initial={},overrides={}){
  const values={
    driverEditId:'rich-driver-1',driverName:'Courier Edited',
    driverDaCode:'DA0001',driverAgency:'Student',
    driverPhone:'000',driverCapacity:'70',
    driverLicenseExpiry:'',driverStatus:'inaktiv',
    driverSince:'',driverNote:'Edited',...overrides
  };
  const calls={save:0,closed:0,refreshed:0,alerts:[],prevented:0};
  const baseline=JSON.parse(JSON.stringify(initial));
  const ctx=vm.createContext({
    drivers:[initial],
    document:{getElementById:id=>{
      if(!(id in values))throw Error('Unexpected original driver form field '+id);
      return {value:values[id]};
    }},
    uid:()=> 'synthetic-new-id',
    save:()=>calls.save++,
    closeDriverModal:()=>calls.closed++,
    refresh:()=>calls.refreshed++,
    alert:text=>calls.alerts.push(text),
    t:key=>key,
    Date
  });
  vm.runInContext(originalFunction,ctx,{filename:'ACTUAL-index.html-saveDriver'});
  const submit=()=>ctx.saveDriver({preventDefault:()=>calls.prevented++});
  return {ctx,calls,submit,baseline};
}
test('real Fleet form offers accessible bounded daily capacity and both locale strings',()=>{
  assert.match(html,/id="driverCapacity" min="0" max="10000" step="1"/);
  assert.match(html,/driverCapacity: 'Napi csomagkapacitás'/);
  assert.match(html,/driverCapacity: 'Daily parcel capacity'/);
});
test('real original driver edit saves capacity and preserves all hidden rich canonical fields',()=>{
  const original={
    id:'rich-driver-1',daCode:'DA0001',name:'Courier',
    status:'aktiv',kapacitas:80,revision:15,
    history:[{id:'old',type:'other',note:'original preserved'}],
    agency:'Student',metadata:{origin:'trusted',hash:'synthetic'},
    extra:{badge:7},lastSeen:'2026-10-19'
  };
  const {ctx,calls,submit}=form(original);
  submit();
  const changed=JSON.parse(JSON.stringify(ctx.drivers[0]));
  assert.equal(changed.kapacitas,70);
  assert.equal(changed.revision,15);
  assert.deepEqual(changed.metadata,original.metadata);
  assert.deepEqual(changed.extra,original.extra);
  assert.equal(changed.lastSeen,original.lastSeen);
  assert.equal(changed.history.length,2,'Status change must append exactly one event');
  assert.deepEqual(changed.history[0],original.history[0]);
  assert.equal(original.history.length,1,'Original history must not be mutated in place');
  assert.equal(calls.save,1);
  assert.equal(calls.closed,1);
  assert.equal(calls.refreshed,1);
  assert.equal(calls.prevented,1);
});
test('invalid capacity cannot silently change original source or call save',()=>{
  const original={
    id:'rich-driver-1',daCode:'DA0001',status:'aktiv',kapacitas:80,
    history:[{id:'old',note:'unchanged'}],revision:10
  };
  for(const raw of ['10001','-1','3.14','not-a-number']){
    const {ctx,calls,submit}=form(original,{driverCapacity:raw});
    submit();
    assert.equal(calls.save,0,'invalid capacity '+raw+' must not persist');
    assert.equal(calls.closed,0);
    assert.equal(calls.alerts.length,1);
    assert.equal(ctx.drivers[0],original,'invalid input must not mutate record');
  }
});
