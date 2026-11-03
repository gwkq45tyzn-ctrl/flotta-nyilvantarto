/**
 * @OnlyCurrentDoc
 * iMile DEMO Google Sheets bridge.
 * Bound to an individually owned TEST workbook only.
 * No Firebase, Drive API, external fetch, photos, or company data.
 * Owner-only sidebar; there is deliberately NO doGet/doPost web endpoint.
 */
var IMILE_DEMO_SHEET='IMILE_DEMO_CAPACITY_V1';
var IMILE_DEMO_HEADER=['date','revision','updatedAt','payloadJson','operationId'];
var IMILE_DEMO_MAX_DAYS=365;
function imileOwner_(){
  var a=Session.getActiveUser().getEmail();
  var b=Session.getEffectiveUser().getEmail();
  var doc=SpreadsheetApp.getActiveSpreadsheet();
  var owner=doc&&doc.getOwner();
  var c=owner&&owner.getEmail();
  if(!a||!b||!c||a.toLowerCase()!==b.toLowerCase()||a.toLowerCase()!==c.toLowerCase())throw Error('OWNER_ONLY');
}
function imileDay_(v){
  if(typeof v!=='string'||!/^20\d{2}-\d{2}-\d{2}$/.test(v))throw Error('INVALID_DAY');
  var t=new Date(v+'T12:00:00Z');
  if(isNaN(t.getTime())||t.toISOString().slice(0,10)!==v)throw Error('INVALID_DAY');
  return v;
}
function imileRowList_(rows){
  if(!Array.isArray(rows)||rows.length<1||rows.length>30)throw Error('INVALID_ROWS');
  var seen={};
  return rows.map(function(row){
    if(!row||Array.isArray(row)||typeof row!=='object')throw Error('INVALID_ROW');
    var keys=Object.keys(row);
    var allowed=['district','newCount','retryCount','plannedCapacity','confirmedCapacity'];
    if(keys.length!==5||keys.some(function(k){return allowed.indexOf(k)<0;}))throw Error('INVALID_FIELDS');
    var d=row.district;
    if(typeof d!=='string'||!(/^[A-Z0-9 -]{1,30}$/).test(d)||d.trim()!==d||Object.prototype.hasOwnProperty.call(seen,d))throw Error('INVALID_DISTRICT');
    seen[d]=true;
    var counts={};
    ['newCount','retryCount','plannedCapacity','confirmedCapacity'].forEach(function(k){
      if(!Number.isSafeInteger(row[k])||row[k]<0||row[k]>10000000)throw Error('INVALID_COUNT');
      counts[k]=row[k];
    });
    if(counts.confirmedCapacity>counts.plannedCapacity||counts.newCount+counts.retryCount>10000000)throw Error('INVALID_CAPACITY');
    return {district:d,newCount:counts.newCount,retryCount:counts.retryCount,plannedCapacity:counts.plannedCapacity,confirmedCapacity:counts.confirmedCapacity};
  }).sort(function(a,b){return a.district<b.district?-1:a.district>b.district?1:0;});
}
function imileWorkbook_(){
  var ss=SpreadsheetApp.getActiveSpreadsheet();
  if(!ss)throw Error('BOUND_TEST_WORKBOOK_REQUIRED');
  return ss;
}
function imileSheet_(create){
  var ss=imileWorkbook_(), sh=ss.getSheetByName(IMILE_DEMO_SHEET);
  if(!sh&&!create)return null;
  if(!sh){
    sh=ss.insertSheet(IMILE_DEMO_SHEET);
    sh.getRange(1,1,1,5).setValues([IMILE_DEMO_HEADER]);
    sh.getRange('A:A').setNumberFormat('@');
    sh.getRange('D:D').setNumberFormat('@');
    sh.setFrozenRows(1);
    return sh;
  }
  if(sh.getLastRow()<1||JSON.stringify(sh.getRange(1,1,1,5).getDisplayValues()[0])!==JSON.stringify(IMILE_DEMO_HEADER))
    throw Error('DEMO_SHEET_SCHEMA_MISMATCH');
  if(sh.getLastRow()>IMILE_DEMO_MAX_DAYS+1)throw Error('DEMO_SHEET_LIMIT');
  return sh;
}
function imileRead_(day,sh){
  if(!sh)return {date:day,revision:0,rows:[],updatedAt:null,operationId:null,found:false,index:2};
  var last=sh.getLastRow(), data=last>1?sh.getRange(2,1,last-1,5).getDisplayValues():[];
  var found=null, index=last+1;
  for(var i=0;i<data.length;i++){
    if(data[i][0]!==day)continue;
    if(found)throw Error('DUPLICATE_DAY');
    var revision=Number(data[i][1]);
    if(!Number.isSafeInteger(revision)||revision<1)throw Error('INVALID_STORED_REVISION');
    var rows;
    try{rows=imileRowList_(JSON.parse(data[i][3]));}catch(e){throw Error('CORRUPTED_DEMO_DATA');}
    found={date:day,revision:revision,rows:rows,updatedAt:data[i][2],operationId:data[i][4],found:true,index:i+2};
    index=i+2;
  }
  return found||{date:day,revision:0,rows:[],updatedAt:null,operationId:null,found:false,index:index};
}
function imilePublic_(record){
  return {date:record.date,revision:record.revision,rows:record.rows,updatedAt:record.updatedAt,found:record.found,
    source:'synthetic-google-sheet',verifiedByTrackingId:false,authoritative:false};
}
function getDemoCapacityDay(date){
  imileOwner_();
  var day=imileDay_(date);
  return imilePublic_(imileRead_(day,imileSheet_(false)));
}
function saveDemoCapacityDay(request){
  imileOwner_();
  if(!request||Array.isArray(request)||typeof request!=='object'||Object.keys(request).sort().join('|')!=='date|expectedRevision|operationId|rows')
    throw Error('INVALID_REQUEST');
  var day=imileDay_(request.date), rows=imileRowList_(request.rows);
  if(!Number.isSafeInteger(request.expectedRevision)||request.expectedRevision<0||request.expectedRevision>1000000)
    throw Error('INVALID_REVISION');
  if(typeof request.operationId!=='string'||!/^[a-f0-9]{32}$/.test(request.operationId))throw Error('INVALID_OPERATION_ID');
  var lock=LockService.getScriptLock();
  if(!lock.tryLock(10000))throw Error('BUSY_RETRY');
  try{
    var sh=imileSheet_(true),old=imileRead_(day,sh),same=JSON.stringify(old.rows)===JSON.stringify(rows);
    if(old.operationId===request.operationId&&old.found){
      if(!same)throw Error('OPERATION_ID_REUSED');
      return imilePublic_(old);
    }
    if(old.revision!==request.expectedRevision)throw Error('REVISION_CONFLICT');
    if(old.revision>=1000000)throw Error('REVISION_LIMIT');
    if(!old.found&&sh.getLastRow()>=IMILE_DEMO_MAX_DAYS+1)throw Error('DEMO_SHEET_LIMIT');
    var version=old.revision+1,at=new Date().toISOString();
    sh.getRange(old.index,1,1,5).setValues([[day,version,at,JSON.stringify(rows),request.operationId]]);
    SpreadsheetApp.flush();
    return imilePublic_({date:day,revision:version,rows:rows,updatedAt:at,found:true});
  }finally{lock.releaseLock();}
}
function exportDemoDemand(date){
  var snapshot=getDemoCapacityDay(date);
  if(!snapshot.found)throw Error('MISSING_DEMO_DAY');
  return {schema:'imile.demo-demand.v1',source:snapshot.source,date:snapshot.date,revision:snapshot.revision,
    verifiedByTrackingId:false,authoritative:false,
    demands:snapshot.rows.map(function(r){
      return {id:snapshot.date+'__'+r.district,date:snapshot.date,district:r.district,newCount:r.newCount,retryCount:r.retryCount};
    })};
}
function onOpen(){
  SpreadsheetApp.getUi().createMenu('iMile DEMÓ').addItem('Szintetikus kerületi terv','openDemoCapacitySidebar').addToUi();
}
function openDemoCapacitySidebar(){
  imileOwner_();
  SpreadsheetApp.getUi().showSidebar(HtmlService.createHtmlOutputFromFile('Sidebar').setTitle('iMile – csak DEMÓ'));
}
