/**
 * Additional edge-case coverage for the #158 original saveDriver() rich preservation.
 * Ensures capacity 0 is valid, no status change does not append history, and
 * unknown future fields survive a pure capacity edit.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const html=readFileSync('index.html','utf8');
const a=html.indexOf('    function saveDriver(e) {');
const b=html.indexOf('\n    function editDriver',a);
const originalFunction=html.slice(a,b);

function form(initial, overrides={}){
  const values={
    driverEditId:initial.id,driverName:initial.name,
    driverDaCode:initial.daCode,driverAgency:initial.agency||'',
    driverPhone:initial.phone||'',driverCapacity:String(initial.kapacitas),
    driverLicenseExpiry:'',driverStatus:initial.status,
    driverSince:'',driverNote:initial.note||'',...overrides
  };
  const calls={save:0,closed:0,refreshed:0,alerts:[]};
  const ctx=vm.createContext({
    drivers:[JSON.parse(JSON.stringify(initial))],
    document:{getElementById:id=>({value:values[id]})},
    uid:()=>'edge-id',
    save:()=>calls.save++,
    closeDriverModal:()=>calls.closed++,
    refresh:()=>calls.refreshed++,
    alert:t=>calls.alerts.push(t),
    t:k=>k,
    Date
  });
  vm.runInContext(originalFunction,ctx);
  const submit=()=>ctx.saveDriver({preventDefault:()=>{}});
  return {ctx,calls,submit};
}

test('capacity 0 is accepted and preserves rich fields',()=>{
  const original={id:'d1',daCode:'DA0001',name:'Zero',status:'aktiv',kapacitas:5,revision:3,history:[],extra:{x:1}};
  const {ctx,calls,submit}=form(original,{driverCapacity:'0'});
  submit();
  assert.equal(ctx.drivers[0].kapacitas,0);
  assert.equal(ctx.drivers[0].revision,3);
  assert.deepEqual(ctx.drivers[0].extra,original.extra);
  assert.equal(calls.save,1);
});

test('no status change does not append history event',()=>{
  const original={id:'d1',daCode:'DA0001',name:'Same',status:'aktiv',kapacitas:80,history:[{id:'h1'}]};
  const {ctx,submit}=form(original,{driverCapacity:'75',driverStatus:'aktiv'});
  submit();
  assert.equal(ctx.drivers[0].history.length,1);
  assert.deepEqual(ctx.drivers[0].history[0],original.history[0]);
});

test('unknown future field survives pure capacity edit',()=>{
  const original={id:'d1',daCode:'DA0001',name:'Future',status:'aktiv',kapacitas:80,futureField:'keep-me',history:[]};
  const {ctx,submit}=form(original,{driverCapacity:'90'});
  submit();
  assert.equal(ctx.drivers[0].futureField,'keep-me');
  assert.equal(ctx.drivers[0].kapacitas,90);
});
