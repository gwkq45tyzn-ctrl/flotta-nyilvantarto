import test from 'node:test';
import assert from 'node:assert/strict';
import {inhub,ofd} from './report-core.mjs';
const hub=['Waybill Number','LM Receive Date','Consignee city','Consignee zipcode'];
const da=['OFD Date','DA','DA Code','Vendor','Station','OFD','Delivered'];
test('In-Hub repair list preserves physical Excel row after blank rows',()=>{
 const m=[hub,[],['A','2026-11-04','Budapest','1117'],[],['B','2026-11-04','Budapest','9999']];
 assert.deepEqual(inhub(m).issues,[{line:5,reason:'invalid_parcel_or_area'}]);
});
test('Duplicate parcel row keeps original position across sparse rows',()=>{
 const m=[hub];m[3]=['A','2026-11-04','Budapest','1117'];m[8]=[...m[3]];
 assert.deepEqual(inhub(m).issues,[{line:9,reason:'duplicate_waybill'}]);
});
test('OFD invalid metric keeps physical source row',()=>{
 assert.deepEqual(ofd([da,[],[],['2026-11-04','Synthetic','QA01','QA','QA',2,3]]).issues,[{line:4,reason:'invalid_da_metric'}]);
});
test('OFD conflicting name points to the actual row',()=>{
 assert.deepEqual(ofd([da,['2026-11-04','Synthetic','QA01','QA','QA',2,1],[],['2026-11-04','Other','QA01','QA','QA',2,1]]).issues,[{line:4,reason:'conflicting_da_name'}]);
});
test('Blank rows do not change successful aggregates',()=>{
 const row=['A','2026-11-04','Dunaharaszti','2330'];
 assert.deepEqual(inhub([hub,[],row,[]]),inhub([hub,row]));
 const metric=['2026-11-04','Synthetic','QA01','QA','QA',2,1];
 assert.deepEqual(ofd([da,[],metric,[]]),ofd([da,metric]));
});
