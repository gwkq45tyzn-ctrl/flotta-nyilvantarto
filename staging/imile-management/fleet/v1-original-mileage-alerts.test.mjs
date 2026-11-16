import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// Exercise the actual ORIGINAL Flotta renderAlerts function as written in
// root index.html, not a reimplemented mileage algorithm or prototype UI.
// No Firebase, browser network, production data or modified Fleet fixture.
const root=new URL('../../../index.html',import.meta.url);
const html=readFileSync(root,'utf8');
const begin=html.indexOf('    function renderAlerts() {');
const end=html.indexOf('    function ensureDriverHistory(d) {',begin);
assert.ok(begin>=0&&end>begin,'Original Fleet alert function anchors changed');
const originalFunction=html.slice(begin,end);
const makeRender=new Function('vehicles','fuelCards','drivers','document',
  't','daysUntil','statusLabel',originalFunction+'\nreturn renderAlerts;');
const vehicle=(km,due,extra={})=>({
  id:'synthetic-vehicle-1',rendszam:'KM-001',status:'aktiv',
  km,kovetkezoSzervizKm:due,...extra
});
const render=(v,daysUntil=()=>null)=>{
  const before=structuredClone(v),container={innerHTML:''};
  const original=makeRender([v],[],[],{
    getElementById(id){assert.equal(id,'alerts');return container;}
  },key=>key==='insurance'?'Kötelező biztosítás':key,
  daysUntil,status=>status);
  original();
  assert.deepEqual(v,before,'Original vehicle rich record may not be mutated');
  return container.innerHTML;
};

test('Original Fleet displays real overdue mandatory oil service in km',()=>{
  const out=render(vehicle(37891,37500));
  assert.match(out,/KM-001/);
  assert.match(out,/Kötelező olajcsere \/ szerviz \(km\)/);
  assert.match(out,/391 km-rel túllépte/);
  assert.match(out,/badge overdue/);
  assert.match(out,/Aktuális: 37891 km · Határ: 37500 km/);
  assert.doesNotMatch(out,/2026-11-16/,'No invented calendar due date');
});
test('Exact due, 500 and 1000 km service warning boundaries',()=>{
  assert.match(render(vehicle(37500,37500)),/Elérte a kötelező km-határt/);
  assert.match(render(vehicle(37500,38000)),/500 km múlva esedékes/);
  assert.match(render(vehicle(37500,38000)),/badge soon/);
  assert.match(render(vehicle(39000,40000)),/1000 km múlva esedékes/);
  assert.match(render(vehicle(39000,40000)),/badge ok-date/);
  assert.doesNotMatch(render(vehicle(39000,40001)),/Kötelező olajcsere/);
});
test('Never create bogus km alert for unconfigured or invalid values',()=>{
  for(const [km,due] of [[100000,0],[-1,38000],['39000',40000],
    [39000,'40000'],[NaN,40000],[Infinity,40000],
    [39000,-1],[39000,1.5],[0,null]]) {
    const out=render(vehicle(km,due));
    assert.doesNotMatch(out,/Kötelező olajcsere/);
  }
});
test('Original dated expiry alerts coexist with mileage alert',()=>{
  const out=render(vehicle(37891,37500,{
    biztositasLejarat:'2026-11-20'
  }),day=>day==='2026-11-20'?5:null);
  assert.match(out,/Kötelező olajcsere/);
  assert.match(out,/Kötelező biztosítás/);
  assert.match(out,/2026-11-20/);
});
