import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {summarizeDistrictCapacity} from '../../../depokapacitas/district-capacity.mjs';
import {previewGoogleDemoExport} from '../../../depokapacitas/google-demo-preview.mjs';
const source=readFileSync(new URL('./Code.gs',import.meta.url),'utf8');
const id=n=>String(n).padStart(32,'0');
const row=(district='XIII',more={})=>({district,newCount:80,retryCount:20,plannedCapacity:120,confirmedCapacity:100,...more});
function createHarness({active='owner@example.test',effective='owner@example.test',owner='owner@example.test'}={}){
 let locked=false,flushes=0,created=0;
 class Sheet{
  constructor(){this.grid=[];this.formats=[];this.name='IMILE_DEMO_CAPACITY_V1';}
  getLastRow(){return this.grid.length;}
  getRange(first,col,rows=1,cols=1){
   if(typeof first==='string')return{setNumberFormat:f=>this.formats.push([first,f])};
   const self=this;
   return{
    getDisplayValues(){return Array.from({length:rows},(_,i)=>Array.from({length:cols},(_,j)=>String(self.grid[first-1+i]?.[col-1+j]??'')));},
    setValues(values){
     assert.equal(values.length,rows);for(const r of values)assert.equal(r.length,cols);
     for(let i=0;i<rows;i++){const idx=first-1+i;self.grid[idx]??=[];for(let j=0;j<cols;j++)self.grid[idx][col-1+j]=values[i][j];}
    }
   };
  }
  setFrozenRows(n){assert.equal(n,1);}
 }
 const spreadsheet={sheets:new Map(),getOwner(){return owner?{getEmail:()=>owner}:null;},getSheetByName(n){return this.sheets.get(n)||null;},insertSheet(n){created++;const s=new Sheet();this.sheets.set(n,s);return s;}};
 const context=vm.createContext({
  Session:{getActiveUser:()=>({getEmail:()=>active}),getEffectiveUser:()=>({getEmail:()=>effective})},
  SpreadsheetApp:{getActiveSpreadsheet:()=>spreadsheet,flush:()=>{flushes++;},getUi:()=>{throw Error('UI_NOT_NEEDED');}},
  LockService:{getScriptLock:()=>({tryLock:()=>{if(locked)return false;locked=true;return true;},releaseLock:()=>{locked=false;}})}
 });
 vm.runInContext(source,context,{filename:'Code.gs'});
 return {api:context,ss:spreadsheet,setIdentity(a,b){active=a;effective=b;},get created(){return created;},get flushes(){return flushes;},setLocked(v){locked=v;}};
}
function save(h,day='2026-11-05',rows=[row()],expectedRevision=0,operationId=id(1)){
 return h.api.saveDemoCapacityDay({date:day,rows,expectedRevision,operationId});
}
test('Read-only missing day does not create any Google sheet',()=>{
 const h=createHarness(),s=h.api.getDemoCapacityDay('2026-11-05');
 assert.equal(s.found,false);assert.equal(s.revision,0);assert.equal(h.created,0);assert.equal(h.flushes,0);
});
test('Save only to dedicated synthetic tab and create immutable header',()=>{
 const h=createHarness(),saved=save(h);assert.equal(saved.revision,1);assert.equal(h.created,1);
 assert.deepEqual([...h.ss.sheets.keys()],['IMILE_DEMO_CAPACITY_V1']);
 assert.deepEqual(h.ss.sheets.values().next().value.grid[0],['date','revision','updatedAt','payloadJson','operationId']);
 assert.equal(h.flushes,1);
});
test('Read roundtrip retains synthetic source and validity flag',()=>{
 const h=createHarness();save(h);
 const s=h.api.getDemoCapacityDay('2026-11-05');
 assert.equal(s.source,'synthetic-google-sheet');assert.equal(s.verifiedByTrackingId,false);
 assert.equal(s.authoritative,false);assert.equal(s.rows[0].district,'XIII');
});
test('Sheet export matches existing Depó demand contract',()=>{
 const h=createHarness();save(h);
 const x=h.api.exportDemoDemand('2026-11-05');
 assert.equal(x.schema,'imile.demo-demand.v2');assert.equal(x.demands.length,1);
 assert.equal(x.estimatedOnly,true);assert.equal(x.draftCapacities.length,1);
 const preview=previewGoogleDemoExport(JSON.stringify(x));
 assert.equal(preview.plannedCapacity,120);assert.equal(preview.confirmedCapacity,100);
 assert.equal(preview.plannedGap,20);assert.equal(preview.confirmedGap,0);
 assert.equal(preview.canCommit,false);
 const stats=summarizeDistrictCapacity({date:x.date,demands:JSON.parse(JSON.stringify(x.demands)),bookings:[],drivers:[],vehicles:[]});
 assert.equal(stats.totalDemand,100);assert.equal(stats.rows[0].newCount,80);assert.equal(stats.rows[0].retryCount,20);
 assert.equal(stats.parcelsVerified,false);
});
test('Idempotent same operation does not write twice',()=>{
 const h=createHarness();const a=save(h),b=save(h);
 assert.equal(a.revision,b.revision);assert.equal(h.flushes,1);
});
test('Idempotency ID reuse with different payload fails',()=>{
 const h=createHarness();save(h);
 assert.throws(()=>save(h,'2026-11-05',[row('XIII',{newCount:1})]),/OPERATION_ID_REUSED/);
});
test('Stale concurrent revision is rejected',()=>{
 const h=createHarness();save(h);
 assert.throws(()=>save(h,'2026-11-05',[row('XIII',{newCount:90})],0,id(2)),/REVISION_CONFLICT/);
 assert.equal(h.flushes,1);
});
test('Update with correct revision writes one row and increments revision',()=>{
 const h=createHarness();save(h);
 const r=save(h,'2026-11-05',[row('XIII',{newCount:90})],1,id(2));
 assert.equal(r.revision,2);assert.equal(h.ss.sheets.values().next().value.grid.length,2);assert.equal(h.flushes,2);
});
test('Parallel contention fails closed, no additional write',()=>{
 const h=createHarness();h.setLocked(true);
 assert.throws(()=>save(h),/BUSY_RETRY/);
 assert.equal(h.created,0);
});
test('Other Google account cannot read or write even if it sees the demo file',()=>{
 const h=createHarness({active:'someone-else@example.test'});
 assert.throws(()=>h.api.getDemoCapacityDay('2026-11-05'),/OWNER_ONLY/);
 assert.throws(()=>save(h),/OWNER_ONLY/);
 assert.equal(h.created,0);
});
test('Shared sheet editor is not treated as owner, even if active equals effective',()=>{
 const h=createHarness({active:'editor@example.test',effective:'editor@example.test',owner:'owner@example.test'});
 assert.throws(()=>h.api.getDemoCapacityDay('2026-11-05'),/OWNER_ONLY/);
 assert.throws(()=>save(h),/OWNER_ONLY/);
 assert.equal(h.created,0);
});
test('Shared Drive spreadsheet without identifiable owner fails closed',()=>{
 const h=createHarness({owner:''});
 assert.throws(()=>save(h),/OWNER_ONLY/);
});
test('Blank identity fails closed',()=>{
 const h=createHarness({active:''});
 assert.throws(()=>save(h),/OWNER_ONLY/);
});
test('Malformed calendar days blocked',()=>{
 const h=createHarness();
 for(const d of ['2026-02-30','2026-13-01','03.11.2026','2026-11-05T00:00:00'])assert.throws(()=>save(h,d),/INVALID_DAY/);
});
test('Duplicate districts cannot corrupt day snapshot',()=>{
 const h=createHarness();
 assert.throws(()=>save(h,'2026-11-05',[row(),row()]),/INVALID_DISTRICT/);
});
test('Spreadsheet formula injection in district is rejected',()=>{
 const h=createHarness();
 for(const d of ['=IMPORTXML','+2','@evil','XIII\n=X',' XII'])assert.throws(()=>save(h,'2026-11-05',[row(d)]),/INVALID_DISTRICT/);
});
test('Negative, decimal, or contradictory capacities rejected',()=>{
 const h=createHarness();
 for(const more of [{newCount:-1},{retryCount:1.5},{confirmedCapacity:121},{plannedCapacity:10000001}])
  assert.throws(()=>save(h,'2026-11-05',[row('XIII',more)]),/INVALID_COUNT|INVALID_CAPACITY/);
});
test('No silent zero: empty source cannot export',()=>{
 const h=createHarness();
 assert.throws(()=>h.api.exportDemoDemand('2026-11-05'),/MISSING_DEMO_DAY/);
});
test('Schema mismatch blocks writing rather than touching unfamiliar sheet',()=>{
 const h=createHarness();save(h);const s=h.ss.sheets.values().next().value;s.grid[0][1]='unknown';
 assert.throws(()=>save(h,'2026-11-05',[row()],1,id(2)),/DEMO_SHEET_SCHEMA_MISMATCH/);
 assert.equal(h.flushes,1);
});
test('Duplicate day in sheet blocks ambiguous reads',()=>{
 const h=createHarness();save(h);const s=h.ss.sheets.values().next().value;s.grid.push([...s.grid[1]]);
 assert.throws(()=>h.api.getDemoCapacityDay('2026-11-05'),/DUPLICATE_DAY/);
});
test('Corrupted JSON fails closed',()=>{
 const h=createHarness();save(h);h.ss.sheets.values().next().value.grid[1][3]='{ broken';
 assert.throws(()=>h.api.getDemoCapacityDay('2026-11-05'),/CORRUPTED_DEMO_DATA/);
});
test('Reject unknown extra request fields',()=>{
 const h=createHarness();
 assert.throws(()=>h.api.saveDemoCapacityDay({date:'2026-11-05',expectedRevision:0,operationId:id(1),rows:[row()],uid:'admin'}),/INVALID_REQUEST/);
});
test('Strict photo/legacy exclusion and no outgoing cloud calls in bridge',()=>{
 for(const name of ['UrlFetchApp.fetch(','DriveApp.','getFirestore(','photoReceipts','doPost(','doGet(','VEHICLE_Fuel_Database','Mobile Attendance','getStorage('])
  assert.equal(source.includes(name),false,name);
});
test('Deterministic order by district for canonical retries',()=>{
 const h=createHarness();let r=save(h,'2026-11-05',[row('XV'),row('XIII')]);
 assert.deepEqual(Array.from(r.rows,x=>x.district),['XIII','XV']);
 r=save(h,'2026-11-05',[row('XIII'),row('XV')]);assert.equal(r.revision,1);
});
