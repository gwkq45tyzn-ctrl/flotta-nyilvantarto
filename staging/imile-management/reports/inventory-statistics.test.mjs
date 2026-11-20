import assert from 'node:assert/strict';
import {inhub} from './report-core.mjs';
import {planInventorySnapshot,inventoryHistory,inventoryHash} from './inventory-statistics.mjs';
const h=['Waybill Number','LM Receive Date','Consignee city','Consignee zipcode','Inventory Station'];
const m=[h,['001','2026-10-29','Budapest','1117','DS(AKE)'],
 ['002','2026-10-30','Szigetszentmiklós','2310','DS(AKE)']];
let passed=0;function t(label,fn){try{fn();passed++}catch(e){throw Error(label+': '+e.message,{cause:e})}}
t('daily station and area details',()=>{
 const r=planInventorySnapshot(inhub(m),m,'2026-10-31');
 assert.equal(r.total,2);assert.equal(r.station,'DS(AKE)');
 assert.ok(r.areas.find(x=>x.area==='Szigetszentmiklós'));
 assert.deepEqual(r.dates,['2026-10-29','2026-10-30']);
});
t('different warehouse in same export blocks storage',()=>{
 const c=m.map(r=>[...r]);c[2][4]='DS(IKA)';
 assert.throws(()=>planInventorySnapshot(inhub(c),c,'2026-10-31'),/egyetlen/);
});
t('future received date blocks snapshot',()=>assert.throws(
 ()=>planInventorySnapshot(inhub(m),m,'2026-10-28'),/későbbi/));
t('no station column cannot be silently guessed',()=>{
 const c=m.map(r=>r.slice(0,4));
 assert.throws(()=>planInventorySnapshot(inhub(c),c,'2026-10-31'),/Inventory Station/);
});
t('missing source blocks snapshot',()=>assert.throws(()=>planInventorySnapshot({kind:'inhub',status:'missing'},m,'2026-10-31')));
t('idempotent historical snapshot counting',()=>{
 const s=planInventorySnapshot(inhub(m),m,'2026-10-31'),result=inventoryHistory([s,s]);
 assert.equal(result.rows.length,1);assert.equal(result.errors[0],'duplicate_inventory_report');
});
t('unknown imported snapshot excluded from trend',()=>{
 const s=planInventorySnapshot(inhub(m),m,'2026-10-31');
 assert.equal(inventoryHistory([s,{key:'INVALID'}]).rows.length,1);
});
const snap=planInventorySnapshot(inhub(m),m,'2026-10-31');
assert.match(await inventoryHash(snap),/^[a-f0-9]{64}$/);passed++;
console.log('PASS: '+passed+' In-Hub station snapshots, receive dates and history dedup cases');
