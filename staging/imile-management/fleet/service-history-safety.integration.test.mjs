import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const load=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const ui=load('./operations-app.mjs'),store=load('./operations-store.mjs'),rules=load('../../../depokapacitas/firestore.rules');
let total=0;
const test=(name,fn)=>{try{fn();total++}catch(e){throw Error(name+': '+e.message,{cause:e})}};
test('service history immutable controls are disabled in edit form',()=>{
 assert.match(ui,/baseline&&kind==='service'&&\['vehicleId','date','status'\]\.includes\(field\.key\)/);
});
test('disabled history fields explicitly restored from baseline on submit',()=>{
 assert.match(ui,/if\(kind==='service'\)for\(const field of \['vehicleId','date','status'\]\)input\[field\]=baseline\.data\[field\]/);
});
test('history correction explains difference from live vehicle status',()=>{
 assert.match(ui,/A mai járműállapothoz új szervizbejegyzést készíts/);
});
test('store checks historical vehicle date and status before any write',()=>{
 assert.match(store,/if\(current\.exists\(\)\)\{\s*const previous=current\.data\(\)\.data;/);
 for(const field of ['vehicleId','date','status'])
  assert.ok(store.includes('record.data.'+field+'===previous.'+field));
});
test('current vehicle status updates only from new service',()=>{
 assert.match(store,/else\{\s*vehicle=await tx\.get\(doc\(db,'vehicles',record\.data\.vehicleId\)\)/);
 assert.match(store,/if\(vehicle\)tx\.update\(doc\(db,'vehicles',record\.data\.vehicleId\)/);
});
test('rules apply create-only atomic service status and deny retroactive mutation',()=>{
 assert.match(rules,/request\.resource\.data\.kind != 'service' \|\|\s*getAfter/);
 for(const field of ['vehicleId','date','status'])
  assert.ok(rules.includes('request.resource.data.data.'+field+' == resource.data.data.'+field));
});
test('production main left untouched by this test',()=>{
 assert.doesNotMatch(store,/imile-management-prod|prod-vehicles/);
});
console.log('PASS: '+total+' service correction UI and Firestore safety integration checks');
