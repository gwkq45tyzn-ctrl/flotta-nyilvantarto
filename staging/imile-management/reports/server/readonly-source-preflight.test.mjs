import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {previewObservedSource} from './readonly-source-preflight.mjs';
import {inhub,ofd} from '../report-core.mjs';
import {planInventorySnapshot} from '../inventory-statistics.mjs';
import {planPerformanceSnapshots} from '../report-statistics.mjs';
const {inhub:sourceInHub,ofd:sourceOFD}=JSON.parse(readFileSync(
 new URL('../fixtures/masked-export-matrices.json',import.meta.url),'utf8'));
const scopeInHub={date:'2099-06-01',station:'DS(SYN_AKE)'};
const scopeOFD={date:'2099-06-01',station:'DS(SYN_AKE)'};
const otherOFD={date:'2099-06-01',station:'DS(SYN_IKA)'};
const inv=matrix=>{
 const g=planInventorySnapshot(inhub(matrix),matrix,scopeInHub.date);
 return {key:g.key,date:g.date,station:g.station,dates:g.dates,areas:g.areas,total:g.total};
};
const performance=(matrix,scope)=>{
 const group=planPerformanceSnapshots(ofd(matrix)).find(x=>
  x.date===scope.date&&x.station===scope.station);
 return {key:group.key,date:group.date,station:group.station,rows:group.rows,
  totalOFD:group.totalOFD,totalDelivered:group.totalDelivered,courierCount:group.courierCount};
};
const preview=(kind,rawMatrix,scope,candidate=null)=>previewObservedSource({
 kind,rawMatrix,scope,candidate});
let count=0;
const check=(title,fn)=>{try{fn();count++}catch(error){throw Error(title+': '+error.message,{cause:error})}};
check('In-Hub observed schema returns 4 packages across 3 areas',()=>{
 const x=preview('inhub',sourceInHub,scopeInHub);
 assert.equal(x.status,'ready');assert.equal(x.total,4);
 assert.equal(x.areaCount,3);assert.equal(x.receiveDayCount,2);
 assert.equal(x.selectedSourceRows,4);assert.equal(x.providerAttested,false);
 assert.equal(x.persistence,'none');
});
check('OFD selected AKE has 25 OFD 17 DLD and 2 couriers',()=>{
 const x=preview('ofd',sourceOFD,scopeOFD);
 assert.equal(x.status,'ready');assert.equal(x.ofd,25);
 assert.equal(x.delivered,17);assert.equal(x.couriers,2);
 assert.equal(x.selectedSourceRows,3);assert.equal(x.excludedSourceRows,1);
});
check('OFD alternative IKA is explicitly selected and counted',()=>{
 const x=preview('ofd',sourceOFD,otherOFD);
 assert.equal(x.status,'ready');assert.equal(x.ofd,20);
 assert.equal(x.delivered,20);assert.equal(x.selectedSourceRows,1);
});
check('OFD candidate reconciliation succeeds when complete',()=>{
 assert.equal(preview('ofd',sourceOFD,scopeOFD,performance(sourceOFD,scopeOFD)).candidateMatched,true);
});
check('OFD candidate with omitted courier blocked',()=>{
 const candidate=performance(sourceOFD,scopeOFD);
 candidate.rows=candidate.rows.slice(0,1);
 candidate.courierCount=1;
 candidate.totalOFD=candidate.rows[0].ofd;
 candidate.totalDelivered=candidate.rows[0].delivered;
 assert.equal(preview('ofd',sourceOFD,scopeOFD,candidate).reason,'candidate_source_mismatch');
});
check('In-Hub candidate exactly matches source',()=>{
 assert.equal(preview('inhub',sourceInHub,scopeInHub,inv(sourceInHub)).candidateMatched,true);
});
check('In-Hub invented count blocked',()=>{
 const candidate=inv(sourceInHub);
 candidate.areas[0].counts[0]+=1;candidate.total+=1;
 assert.equal(preview('inhub',sourceInHub,scopeInHub,candidate).reason,
  'inventory_scope_or_candidate_invalid');
});
check('mixed depot In-Hub must retain count by explicit station',()=>{
 const m=structuredClone(sourceInHub);
 const other=[...m[1]];other[1]='SYNTHETIC_NEW_ID';other[3]='DS(SYN_IKA)';
 m.push(other);
 const x=preview('inhub',m,scopeInHub);
 assert.equal(x.status,'ready');assert.equal(x.total,4);
 assert.equal(x.selectedSourceRows,4);assert.equal(x.excludedSourceRows,1);
});
check('invalid Budapest postcode reported by row number without raw value',()=>{
 const m=structuredClone(sourceInHub);m[1][25]='9999';
 const x=preview('inhub',m,scopeInHub);
 assert.equal(x.status,'blocked');assert.equal(x.issues[0].line,2);
 assert.equal(x.issues[0].reason,'invalid_budapest_postcode');
 assert.doesNotMatch(JSON.stringify(x),/9999|SYN_WAYBILL|SYNTHETIC_NEW_ID/);
});
check('out of scope In-Hub invalid postcode blocks the entire preview',()=>{
 const m=structuredClone(sourceInHub);
 const bad=[...m[1]];bad[1]='SYNTHETIC_EXTRA_ID';bad[3]='DS(SYN_IKA)';bad[25]='9999';
 m.push(bad);
 const x=preview('inhub',m,scopeInHub);
 assert.equal(x.status,'blocked');assert.equal(x.issues.at(-1).line,m.length);
});
check('out of scope OFD invalid metric blocks whole export',()=>{
 const m=structuredClone(sourceOFD);m[4][4]=-99;
 const x=preview('ofd',m,scopeOFD);
 assert.equal(x.status,'blocked');assert.equal(x.issues[0].line,5);
});
check('OFD numeric DA Code type is not guessed',()=>{
 const m=structuredClone(sourceOFD);m[1][2]=7;
 const x=preview('ofd',m,scopeOFD);
 assert.equal(x.reason,'source_type_mismatch');assert.match(x.issues[0].reason,/DA Code/);
});
check('In-Hub numeric parcel ID type is not guessed',()=>{
 const m=structuredClone(sourceInHub);m[1][1]=700001;
 const x=preview('inhub',m,scopeInHub);
 assert.equal(x.reason,'source_type_mismatch');
});
check('no schema guessing for modified header',()=>{
 const m=structuredClone(sourceOFD);m[0][9]='History Delivered';
 assert.equal(preview('ofd',m,scopeOFD).reason,'observed_schema_mismatch');
});
check('missing scope is not silently selected',()=>{
 assert.throws(()=>previewObservedSource({kind:'ofd',rawMatrix:sourceOFD}),/explicit_scope_required/);
});
check('missing station never defaults to AKE',()=>{
 assert.equal(preview('ofd',sourceOFD,{date:'2099-06-01',station:'DS(AKE)'}).reason,'scope_not_found');
});
check('source PII never leaked into read-only output',()=>{
 const value=JSON.stringify(preview('ofd',sourceOFD,scopeOFD))+
  JSON.stringify(preview('inhub',sourceInHub,scopeInHub));
 assert.doesNotMatch(value,/SYN_DA_|SYN_WAYBILL|SYNTHETIC DRIVER|Dunaharaszti|1097/);
});
check('raw data too many columns refused',()=>{
 const huge=[Array(101).fill('x'),Array(101).fill('x')];
 assert.equal(preview('inhub',huge,scopeInHub).reason,'invalid_source_matrix_or_limits');
});
check('4 KiB raw cell cannot become a preview',()=>{
 const m=structuredClone(sourceInHub);m[1][23]='A'.repeat(4097);
 assert.equal(preview('inhub',m,scopeInHub).reason,'invalid_source_matrix_or_limits');
});
check('wrong receive-date chronology blocks In-Hub scope',()=>{
 assert.equal(preview('inhub',sourceInHub,{date:'2099-05-30',
 station:scopeInHub.station}).reason,'inventory_scope_or_candidate_invalid');
});
check('Excel physical row number remains accurate after a blank source row',()=>{
 const m=structuredClone(sourceInHub);
 m.splice(2,0,Array(m[0].length).fill(''));
 m[3][25]='9999';
 const result=preview('inhub',m,scopeInHub);
 assert.equal(result.reason,'raw_source_blocked');
 assert.equal(result.issues[0].line,4);
});
check('whitespace-only source rows are ignored consistently',()=>{
 const m=structuredClone(sourceInHub);
 m.splice(2,0,Array(m[0].length).fill('   '));
 const result=preview('inhub',m,scopeInHub);
 assert.equal(result.status,'ready');
 assert.equal(result.sourceRows,4);
 assert.equal(result.selectedSourceRows,4);
});
console.log('PASS: '+count+' read-only scoped source preflight, privacy and repair-diagnostic tests');
