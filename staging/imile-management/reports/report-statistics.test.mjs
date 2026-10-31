import assert from 'node:assert/strict';
import {ofd} from './report-core.mjs';
import {planPerformanceSnapshots,buildPerformanceStatistics,snapshotHash,docKey} from './report-statistics.mjs';
const header=['OFD Date','DA','DA Code','Vendor','OFD','Delivered','Station'];
const record=(code,ofdN,del,station='DS(AKE)',vendor='V',day='2026-10-30')=>
 [day,'Driver '+code,code,vendor,ofdN,del,station];
const report=(rows)=>ofd([header,...rows]);
let n=0;const test=(name,fn)=>{try{fn();n++}catch(error){throw Error(name+': '+error.message,{cause:error})}};
test('same courier repeated raw rows becomes one daily record',()=>{
 const v=planPerformanceSnapshots(report([record('D1',4,3),record('D1',6,5)]));
 assert.equal(v.length,1);assert.equal(v[0].rows.length,1);assert.equal(v[0].totalOFD,10);
});
test('separate stations produce distinct daily documents',()=>{
 const v=planPerformanceSnapshots(report([record('D1',4,3),record('D2',6,5,'DS(IKA)')]));
 assert.equal(v.length,2);assert.notEqual(v[0].key,v[1].key);
});
test('same DA at two vendors in a station blocks saving',()=>{
 assert.throws(()=>planPerformanceSnapshots(report([record('D1',4,3),record('D1',6,5,'DS(AKE)','Other')])),/egyszer/);
});
test('same courier same day at another station is allowed',()=>{
 const v=planPerformanceSnapshots(report([record('D1',4,3),record('D1',6,5,'DS(IKA)')]));
 assert.equal(v.length,2);
});
test('weighted courier rate and distinct days',()=>{
 const s=planPerformanceSnapshots(report([record('D1',1,1),record('D1',9,4,'DS(AKE)','V','2026-10-31')]));
 const a=buildPerformanceStatistics(s.map(x=>({...x,status:'provisional'})));
 assert.equal(a.couriers[0].rate,.5);assert.equal(a.couriers[0].days,2);assert.equal(a.totalOFD,10);
});
test('daily vendor SPR counts distinct couriers',()=>{
 const a=planPerformanceSnapshots(report([record('D1',40,20),record('D2',60,60)]));
 const b=buildPerformanceStatistics(a.map(x=>({...x,status:'final'})));
 assert.equal(b.vendors[0].spr,50);assert.equal(b.vendors[0].rate,.8);
});
test('provisional is not treated as final',()=>{
 const s=planPerformanceSnapshots(report([record('D1',1,1)]));
 const a=buildPerformanceStatistics(s.map(x=>({...x,status:'provisional'})));
 assert.equal(a.couriers[0].finalDays,0);
});
test('same daily key twice does not double analytics',()=>{
 const s=planPerformanceSnapshots(report([record('D1',4,3)]))[0];
 const a=buildPerformanceStatistics([{...s,status:'provisional'},{...s,status:'provisional'}]);
 assert.equal(a.totalOFD,4);assert.equal(a.partial,true);assert.equal(a.issues[0],'duplicate_daily_report');
});
test('invalid daily data is not silently a 0',()=>{
 const s=planPerformanceSnapshots(report([record('D1',4,3)]))[0];
 const a=buildPerformanceStatistics([{...s,status:'provisional',rows:[{daCode:'D1',daName:'Driver D1',vendor:'V',ofd:4,delivered:7}]}]);
 assert.equal(a.partial,true);
});
test('dataset with different vendor history preserves both vendors',()=>{
 const s=planPerformanceSnapshots(report([record('D1',4,3,'DS(AKE)','A'),
 record('D1',6,6,'DS(AKE)','B','2026-10-31')]));
 const a=buildPerformanceStatistics(s.map(x=>({...x,status:'final'})));
 assert.deepEqual(a.couriers[0].vendors,['A','B']);
});
test('doc key encodes station to avoid path separators',()=>assert.equal(docKey('2026-10-30','DS/AKE'),'2026-10-30__DS%2FAKE'));
test('snapshot content order stable',()=>{
 const s=planPerformanceSnapshots(report([record('D2',1,1),record('D1',2,1)]));
 assert.deepEqual(s[0].rows.map(x=>x.daCode),['D1','D2']);
});
test('report must be ready before saving',()=>assert.throws(()=>planPerformanceSnapshots({status:'missing',kind:'ofd'})));
const example=planPerformanceSnapshots(report([record('D1',10,8)]))[0];
const hash=await snapshotHash(example);assert.match(hash,/^[a-f0-9]{64}$/);assert.equal(hash,await snapshotHash(example));n++;
console.log('PASS: '+n+' snapshot storage identity, weighted statistics and SHA256 cases');
