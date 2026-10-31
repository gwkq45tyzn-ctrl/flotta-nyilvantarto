import assert from 'node:assert/strict';
import {inhub,ofd} from '../report-core.mjs';
import {planPerformanceSnapshots} from '../report-statistics.mjs';
import {planInventorySnapshot} from '../inventory-statistics.mjs';
import {reconcileWithRawExport} from './raw-export-reconciliation.mjs';
import {validateTrustedReport} from './trusted-report-validation.mjs';

const ofdHead=['OFD Date','DA','DA Code','Vendor','OFD','Delivered','Station'];
const ofdMatrix=[ofdHead,
 ['2099-05-01','SYNTHETIC ONE','DA001','Vendor X',5,3,'DS(AKE)'],
 ['2099-05-01','SYNTHETIC ONE','DA001','Vendor X',5,4,'DS(AKE)'],
 ['2099-05-01','SYNTHETIC TWO','DA002','Vendor X',6,6,'DS(AKE)']];
const inhubHead=['Waybill Number','LM Receive Date','Consignee city','Consignee zipcode','Inventory Station'];
const inhubMatrix=[inhubHead,
 ['SYNTHETIC_WAYBILL_1','2099-04-29','Budapest','1117','DS(AKE)'],
 ['SYNTHETIC_WAYBILL_2','2099-04-30','Szigetszentmiklós','2310','DS(AKE)'],
 ['SYNTHETIC_WAYBILL_3','2099-04-30','Dunaharaszti','2330','DS(AKE)']];
const ofdCandidate=(matrix=ofdMatrix)=>{
 const groups=planPerformanceSnapshots(ofd(matrix));assert.equal(groups.length,1);
 const x=groups[0];return {key:x.key,date:x.date,station:x.station,
  rows:x.rows,totalOFD:x.totalOFD,totalDelivered:x.totalDelivered,courierCount:x.courierCount};
};
const inventoryCandidate=(matrix=inhubMatrix)=>{
 const x=planInventorySnapshot(inhub(matrix),matrix,'2099-05-01');
 return {key:x.key,date:x.date,station:x.station,dates:x.dates,areas:x.areas,total:x.total};
};
let passed=0;
const test=(label,fn)=>{try{fn();passed++;}catch(error){throw Error(label+': '+error.message,{cause:error})}};
const doOFD=(matrix=ofdMatrix,candidate=ofdCandidate())=>
 reconcileWithRawExport({kind:'ofd',candidate,rawMatrix:matrix});
const doInHub=(matrix=inhubMatrix,candidate=inventoryCandidate())=>
 reconcileWithRawExport({kind:'inhub',candidate,rawMatrix:matrix});
test('raw OFD source rows reconcile duplicate courier',()=>{
 const r=doOFD();
 assert.equal(r.sourceRows,3);assert.equal(r.matching,true);
 assert.equal(r.contentHash,validateTrustedReport('ofd',ofdCandidate()).contentHash);
 assert.equal(r.validation,'raw-matrix-reconciled-not-provider-attested');
});
test('raw In-Hub supports Budapest districts and suburb names',()=>{
 const r=doInHub();
 assert.equal(r.sourceRows,3);
 assert.equal(r.contentHash,validateTrustedReport('inhub',inventoryCandidate()).contentHash);
});
test('raw waybills and DA names not present in reconciliation output',()=>{
 const result=JSON.stringify(doInHub())+JSON.stringify(doOFD());
 assert.doesNotMatch(result,/SYNTHETIC_WAYBILL_|SYNTHETIC ONE/);
});
test('OFD altered delivered totals rejected',()=>assert.throws(()=>{
 const p=ofdCandidate();p.rows[0].delivered++;p.totalDelivered++;doOFD(ofdMatrix,p);
},/raw_source_report_mismatch/));
test('OFD fake courier count rejected',()=>assert.throws(()=>{
 const p=ofdCandidate();p.courierCount=99;doOFD(ofdMatrix,p);
},/untrusted_ofd_aggregate/));
test('OFD DA vendor change rejected',()=>assert.throws(()=>{
 const p=ofdCandidate();p.rows[0].vendor='Vendor Y';doOFD(ofdMatrix,p);
},/raw_source_report_mismatch/));
test('OFD partial source rejected as a different snapshot',()=>assert.throws(()=>{
 doOFD([ofdHead,...ofdMatrix.slice(1,3)]);
},/raw_source_report_mismatch/));
test('OFD mixed days rejected',()=>assert.throws(()=>{
 doOFD([...ofdMatrix,['2099-05-02','SYNTHETIC THIRD','DA003','Vendor X',2,1,'DS(AKE)']]);
},/raw_source_multiple_days_or_stations/));
test('OFD mixed station rejected',()=>assert.throws(()=>{
 doOFD([...ofdMatrix,['2099-05-01','SYNTHETIC THIRD','DA003','Vendor X',2,1,'DS(IKA)']]);
},/raw_source_multiple_days_or_stations/));
test('OFD conflicting vendor assigned to same DA blocked',()=>assert.throws(()=>{
 doOFD([...ofdMatrix,['2099-05-01','SYNTHETIC ONE','DA001','Vendor Y',2,1,'DS(AKE)']]);
},/raw_source_daily_conflict/));
test('OFD invalid metric blocked',()=>assert.throws(()=>{
 doOFD([ofdHead,['2099-05-01','Driver','DA','V',1,3,'DS(AKE)']]);
},/raw_source_blocked/));
test('OFD missing source blocked',()=>assert.throws(()=>{
 doOFD([ofdHead]);
},/raw_source_missing|invalid_source_matrix/));
test('In-Hub missing trusted station field blocked',()=>assert.throws(()=>{
 const matrix=inhubMatrix.map(r=>r.slice(0,-1));doInHub(matrix);
},/raw_source_inventory_station_or_day_invalid/));
test('In-Hub contradictory source stations blocked',()=>assert.throws(()=>{
 const matrix=inhubMatrix.map(r=>[...r]);matrix[2][4]='DS(IKA)';
 doInHub(matrix);
},/raw_source_inventory_station_or_day_invalid/));
test('In-Hub tampered aggregate blocked',()=>assert.throws(()=>{
 const p=inventoryCandidate();p.areas[0].counts[0]++;p.total++;
 doInHub(inhubMatrix,p);
},/raw_source_report_mismatch/));
test('In-Hub duplicated parcel blocked',()=>assert.throws(()=>{
 doInHub([...inhubMatrix,inhubMatrix[1]]);
},/raw_source_blocked/));
test('In-Hub invalid received date blocked',()=>assert.throws(()=>{
 doInHub([inhubHead,['SYNTHETIC_WAYBILL','wrong','Budapest','1117','DS(AKE)']]);
},/raw_source_blocked/));
test('source object cell refused',()=>assert.throws(()=>{
 doInHub([inhubHead,[{unsafe:'object'},'2099-04-30','Budapest','1117','DS(AKE)']]);
},/invalid_source_cells/));
test('excessive raw source columns blocked',()=>assert.throws(()=>{
 doInHub([Array(101).fill('a'),Array(101).fill('b')]);
},/invalid_source_cells/));
test('missing source rows blocked',()=>assert.throws(()=>{
 doInHub([inhubHead]);
},/invalid_source_matrix/));
test('oversized raw text cell blocked before transformation',()=>assert.throws(()=>{
 doInHub([inhubHead,['W1','2099-04-30','X'.repeat(4097),'1117','DS(AKE)']]);
},/raw_source_limit_exceeded/));
test('excessive raw cell count blocked before transformation',()=>assert.throws(()=>{
 const large=[inhubHead,...Array.from({length:1501},()=>Array(100).fill('x'))];
 doInHub(large);
},/raw_source_limit_exceeded/));
test('excessive raw UTF8 bytes blocked before transformation',()=>assert.throws(()=>{
 const rows=Array.from({length:1100},(_,i)=>['W'+i,'2099-04-30','A'.repeat(4000),'1117','DS(AKE)']);
 doInHub([inhubHead,...rows]);
},/raw_source_limit_exceeded/));
console.log('PASS: '+passed+' raw export reconciliation, conflict and data-minimization tests');
