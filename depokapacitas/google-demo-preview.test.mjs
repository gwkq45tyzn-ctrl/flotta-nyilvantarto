import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {previewGoogleDemoExport,MAX_GOOGLE_DEMO_BYTES} from './google-demo-preview.mjs';

const day='2026-11-05';
const row=(district='XIII',newCount=80,retryCount=20)=>({id:day+'__'+district,date:day,district,newCount,retryCount});
const capacity=(district='XIII',plannedCapacity=120,confirmedCapacity=100)=>({district,plannedCapacity,confirmedCapacity});
function valid(){
 return {schema:'imile.demo-demand.v2',source:'synthetic-google-sheet',date:day,revision:2,
  verifiedByTrackingId:false,authoritative:false,estimatedOnly:true,
  demands:[row()],draftCapacities:[capacity()]};
}
const parse=obj=>previewGoogleDemoExport(JSON.stringify(obj));
const denied=(o,reason)=>assert.throws(()=>parse(o),new RegExp('GOOGLE_DEMO_'+reason));

test('Synthetic v2 export previews manual new/retry and planned/confirmed gaps',()=>{
 const r=parse(valid());
 assert.equal(r.status,'synthetic-preview-only');assert.equal(r.date,day);
 assert.equal(r.totalNew,80);assert.equal(r.totalRetry,20);assert.equal(r.totalDemand,100);
 assert.equal(r.plannedCapacity,120);assert.equal(r.confirmedCapacity,100);
 assert.equal(r.plannedGap,20);assert.equal(r.confirmedGap,0);
 assert.equal(r.authoritative,false);assert.equal(r.verifiedByTrackingId,false);assert.equal(r.canCommit,false);
});
test('v1 previous Sheets exports are readable but capacity stays unknown, not zero',()=>{
 const o=valid();o.schema='imile.demo-demand.v1';delete o.estimatedOnly;delete o.draftCapacities;
 const r=parse(o);
 assert.equal(r.totalDemand,100);assert.equal(r.plannedCapacity,null);assert.equal(r.confirmedGap,null);
 assert.equal(r.rows[0].confirmedCapacity,null);
});
test('Missing or invalid synthetic schema is rejected',()=>{
 for(const schema of [null,'imile.demo-demand.v3','imile.production-demand.v1']){
  const o=valid();o.schema=schema;denied(o,'INVALID_SCHEMA');
 }
});
test('Authoritative or tracking-verified claims cannot enter as DEMO',()=>{
 for(const key of ['authoritative','verifiedByTrackingId']){
  const o=valid();o[key]=true;denied(o,'INVALID_SCHEMA');
 }
});
test('Unexpected top-level data is rejected rather than stored',()=>{
 const o=valid();o.uid='user';denied(o,'INVALID_SCHEMA');
});
test('Invalid revision/date and missing source are blocked',()=>{
 for(const [field,value]of [['date','2026-02-30'],['revision',0],['source','company-export']]){
  const o=valid();o[field]=value;denied(o,'INVALID_SCHEMA');
 }
});
test('Mismatched day or identifier on an export row is blocked',()=>{
 for(const field of ['id','date']){
  const o=valid();o.demands[0][field]='bad';denied(o,'INVALID_DEMAND');
 }
});
test('HTML / spreadsheet formula injection in district is blocked',()=>{
 for(const district of ['<img src=x onerror=alert(1)>','=HYPERLINK("x")','XIII\n<script>',' xiii ','@evil']){
  const o=valid();o.demands[0].district=district;denied(o,'INVALID_DEMAND');
 }
});
test('Wrong numeric type, negative and decimal counts are blocked',()=>{
 for(const count of [-1,1.5,'120',10000001,Infinity]){
  const o=valid();o.demands[0].newCount=count;denied(o,'INVALID_DEMAND');
 }
});
test('A new+retry total above 10m is blocked',()=>{
 const o=valid();o.demands[0].newCount=9999999;o.demands[0].retryCount=2;denied(o,'INVALID_DEMAND');
});
test('Duplicate district cannot inflate manual demand',()=>{
 const o=valid();o.demands.push({...o.demands[0]});o.draftCapacities.push({...o.draftCapacities[0]});denied(o,'INVALID_DEMAND');
});
test('Missing or extra draft capacity, and unknown district are blocked',()=>{
 const a=valid();a.draftCapacities=[];denied(a,'INVALID_DRAFTS');
 const b=valid();b.draftCapacities[0].district='XV';denied(b,'INVALID_DRAFTS');
});
test('Invalid or contradictory draft capacity is blocked',()=>{
 for(const [field,value]of [['plannedCapacity',-2],['plannedCapacity',10000001],['confirmedCapacity',200],['confirmedCapacity','3']]){
  const o=valid();o.draftCapacities[0][field]=value;denied(o,'INVALID_DRAFTS');
 }
});
test('A forged estimatedOnly=false marker is not accepted',()=>{
 const o=valid();o.estimatedOnly=false;denied(o,'INVALID_DRAFTS');
});
test('Empty list and too many districts are rejected',()=>{
 const a=valid();a.demands=[];a.draftCapacities=[];denied(a,'INVALID_SCHEMA');
 const b=valid();b.demands=Array.from({length:31},(_,i)=>row('D'+i));b.draftCapacities=b.demands.map(x=>capacity(x.district));denied(b,'INVALID_SCHEMA');
});
test('No silent coalescing: demand and draft districts must match exactly',()=>{
 const o=valid();o.demands.push(row('XV',40,30));o.draftCapacities.push(capacity('XVI',80,50));denied(o,'INVALID_DRAFTS');
});
test('Sorted stable preview with independent districts and deficits',()=>{
 const o=valid();o.demands.push(row('XII',90,10));o.draftCapacities.push(capacity('XII',70,60));
 const r=parse(o);
 assert.deepEqual(r.rows.map(x=>x.district),['XII','XIII']);
 assert.equal(r.totalDemand,200);assert.equal(r.plannedCapacity,190);assert.equal(r.confirmedCapacity,160);
 assert.equal(r.plannedGap,-10);assert.equal(r.confirmedGap,-40);
});
test('Invalid JSON, non-string and oversized UTF8 input fail before any writes',()=>{
 assert.throws(()=>previewGoogleDemoExport('{bad'),/GOOGLE_DEMO_INVALID_JSON/);
 assert.throws(()=>previewGoogleDemoExport(null),/GOOGLE_DEMO_FILE_LIMIT/);
 assert.throws(()=>previewGoogleDemoExport('a'.repeat(MAX_GOOGLE_DEMO_BYTES+1)),/GOOGLE_DEMO_FILE_LIMIT/);
});
test('Read-only bridge never imports SDKs, mutates Firestore or requests Google APIs',()=>{
 const source=readFileSync(new URL('./google-demo-preview.mjs',import.meta.url),'utf8');
 for(const key of ['firebase','Firestore','writeBatch','setDoc','runTransaction','fetch(', 'GoogleDrive','UrlFetchApp','DriveApp'])
  assert.equal(source.includes(key),false,key);
});
test('Depó UI keeps the existing import separate from DEMO and never commits DEMO',()=>{
 const app=readFileSync(new URL('./app.js',import.meta.url),'utf8');
 const p=app.indexOf('async function previewGoogleDemoFile('),end=app.indexOf('function navigate(',p);
 assert.ok(p>0&&end>p);
 const previewCode=app.slice(p,end);
 for(const key of ['writeBatch(','setDoc(','runTransaction(','uploadBytes(','fetch(','importFile('])
  assert.equal(previewCode.includes(key),false,key);
 assert.match(app,/id="googleDemoPreviewForm"/);
 assert.match(app,/e\.target\.id==='googleDemoPreviewForm'/);
 assert.match(app,/googleDemoPreview=null;for\(const un of state\.unsubscribe/);
});
