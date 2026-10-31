/**
 * Read-only local export preflight for observed 26/35-column iMile schemas.
 * No network, Firebase, persistence or provider attestation.
 * Only sanitized line-number issues and aggregate totals are returned.
 */
import {readFileSync} from 'node:fs';
import {inhub,ofd,cityOrDistrict} from '../report-core.mjs';
import {planInventorySnapshot} from '../inventory-statistics.mjs';
import {planPerformanceSnapshots} from '../report-statistics.mjs';
import {reconcileWithRawExport} from './raw-export-reconciliation.mjs';

const schema=JSON.parse(readFileSync(new URL('../fixtures/observed-schema.json',import.meta.url),'utf8'));
const DATE=/^20\d{2}-\d{2}-\d{2}$/;
const dateValid=x=>typeof x==='string'&&DATE.test(x)&&
 Number.isFinite(Date.parse(x+'T12:00:00Z'))&&
 new Date(x+'T12:00:00Z').toISOString().slice(0,10)===x;
const validStation=x=>typeof x==='string'&&x.length>0&&x===x.trim()&&
 x.length<=160&&!/[\u0000-\u001f\u007f]/.test(x);
const pvalue=x=>x===undefined||x===null?'':String(x).trim();
const SCHEMA_ID='observed-raw-2026-10-31';
const ROW_TYPES={
 inhub:{'Waybill Number':'string','Inventory Station':'string',
  'LM Receive Date':'string','Consignee city':'string','Consignee zipcode':'string'},
 ofd:{'OFD Date':'string','DA':'string','DA Code':'string',
  'Vendor':'string','Station':'string','OFD':'number','Delivered':'number'}
};
const MAX_ISSUES=100;
const result=(kind,scope,sourceRows,selectedRows,details)=>Object.freeze({
 kind,schema:SCHEMA_ID,scope:{...scope},sourceRows,
 selectedSourceRows:selectedRows,
 excludedSourceRows:sourceRows-selectedRows,
 providerAttested:false,persistence:'none',...details
});
function reject(kind,scope,sourceRows,code,issues=[]){
 return result(kind,scope,sourceRows,0,{
  status:'blocked',reason:code,
  issues:issues.slice(0,MAX_ISSUES).map(x=>Object.freeze({line:x.line,reason:x.reason})),
  issueCount:issues.length,issuesOmitted:Math.max(0,issues.length-MAX_ISSUES)
 });
}
function issueForInhub(matrix,line,sourceReason,h){
 if(sourceReason==='duplicate_waybill')return 'duplicate_waybill';
 const row=matrix[line-1]||[];
 const id=row[h.get('Waybill Number')],city=row[h.get('Consignee city')],
  zip=row[h.get('Consignee zipcode')],date=row[h.get('LM Receive Date')];
 if(typeof id!=='string'||!id.trim())return 'waybill_missing_or_wrong_type';
 if(!pvalue(city))return 'missing_city';
 if(/^budapest$/i.test(pvalue(city))&&!cityOrDistrict(city,zip))
  return 'invalid_budapest_postcode';
 if(!pvalue(date)||typeof date!=='string')return 'invalid_lm_receive_datetime';
 return 'invalid_parcel_or_area';
}
function headMap(matrix,kind){
 const observed=schema[kind]?.headers;
 if(!Array.isArray(matrix)||!Array.isArray(matrix[0])||!observed)return null;
 const headers=matrix[0];
 if(headers.length!==observed.length||headers.some((x,i)=>x!==observed[i]))return null;
 return new Map(headers.map((x,i)=>[x,i]));
}
function typeIssues(matrix,kind,headers){
 const issues=[],types=ROW_TYPES[kind];
 for(let i=1;i<matrix.length;i++){
  const row=matrix[i];
  if(!Array.isArray(row))continue;
  if(row.every(v=>v==null||v===''))continue;
  for(const [field,wanted]of Object.entries(types)){
   const v=row[headers.get(field)];
   if(v!==undefined&&v!==null&&v!==''&&typeof v!==wanted)
    issues.push({line:i+1,reason:'wrong_source_type:'+field});
  }
 }
 return issues;
}
function bounded(matrix){
 if(!Array.isArray(matrix)||matrix.length<2||matrix.length>10002)return false;
 let count=0,bytes=0;
 for(const row of matrix){
  if(!Array.isArray(row)||row.length>100)return false;
  count+=row.length;if(count>150000)return false;
  for(const cell of row){
   if(cell!==null&&cell!==undefined&&!['string','number','boolean'].includes(typeof cell))return false;
   const cellBytes=Buffer.byteLength(cell==null?'':String(cell),'utf8');
   if(cellBytes>4096)return false;
   bytes+=cellBytes;if(bytes>4194304)return false;
  }
 }
 return true;
}
/**
 * Preview exactly one explicitly chosen depot/day. Multi-depot source rows
 * are validated BEFORE scoping, including rows outside the selected depot.
 * An optional candidate must match the entire selected set, not a subset.
 */
export function previewObservedSource({kind,rawMatrix,scope,candidate=null}={}){
 if(!['inhub','ofd'].includes(kind)||!scope||
  typeof scope!=='object'||Array.isArray(scope)||
  Object.keys(scope).sort().join(',')!=='date,station'||
  !dateValid(scope.date)||!validStation(scope.station))
  throw Error('explicit_scope_required');
 if(!bounded(rawMatrix))return reject(kind,scope,0,'invalid_source_matrix_or_limits');
 // report-core skips blank rows. Preserve the real Excel line indexes in
 // diagnostic output even when the source contains blank/whitespace rows.
 const filledLines=rawMatrix.map((row,i)=>({row,line:i+1})).slice(1)
  .filter(x=>x.row.some(v=>pvalue(v)!==''));
 const sourceRows=filledLines.length;
 const headers=headMap(rawMatrix,kind);
 if(!headers)return reject(kind,scope,sourceRows,'observed_schema_mismatch');
 const wrongTypes=typeIssues(rawMatrix,kind,headers);
 if(wrongTypes.length)return reject(kind,scope,sourceRows,'source_type_mismatch',wrongTypes);
 let full;
 try{full=kind==='ofd'?ofd(rawMatrix):inhub(rawMatrix);}
 catch{return reject(kind,scope,sourceRows,'raw_source_schema_invalid');}
 if(full.status!=='ready'){
  const issues=full.issues||[];
  const actualLine=reported=>filledLines[reported-2]?.line??reported;
  const mapped=kind==='inhub'?issues.map(x=>({
   line:actualLine(x.line),
   reason:issueForInhub(rawMatrix,actualLine(x.line),x.reason,headers)
  })):issues.map(x=>({line:actualLine(x.line),reason:x.reason}));
  return reject(kind,scope,sourceRows,'raw_source_'+full.status,mapped);
 }
 if(kind==='ofd'){
  let groups;
  try{groups=planPerformanceSnapshots(full);}
  catch{return reject(kind,scope,sourceRows,'courier_vendor_conflict');}
  const found=groups.filter(x=>x.date===scope.date&&x.station===scope.station);
  if(found.length!==1)return reject(kind,scope,sourceRows,'scope_not_found');
  const g=found[0],selectedSourceRows=full.rows.filter(x=>
   x.date===scope.date&&x.station===scope.station)
   .reduce((n,r)=>n+r.sourceCount,0);
  if(candidate){
   try{reconcileWithRawExport({kind,candidate,rawMatrix,
    rawScope:{date:scope.date,station:scope.station}});}
   catch{return reject(kind,scope,sourceRows,'candidate_source_mismatch');}
  }
  return result(kind,scope,sourceRows,selectedSourceRows,{
   status:'ready',ofd:g.totalOFD,delivered:g.totalDelivered,
   couriers:g.courierCount,candidateMatched:!!candidate,
   origin:'local-matrix-not-provider-attested'
  });
 }
 const selected=filledLines.filter(x=>
  x.row[headers.get('Inventory Station')]===scope.station).map(x=>x.row);
 const selectedSourceRows=selected.length;
 if(!selectedSourceRows)return reject(kind,scope,sourceRows,'scope_not_found');
 let g;
 try{
  const narrowed=[rawMatrix[0],...selected],subset=inhub(narrowed);
  g=planInventorySnapshot(subset,narrowed,scope.date);
  if(candidate)reconcileWithRawExport({kind,candidate,rawMatrix:narrowed});
 }catch{return reject(kind,scope,sourceRows,'inventory_scope_or_candidate_invalid');}
 return result(kind,scope,sourceRows,selectedSourceRows,{
  status:'ready',total:g.total,areaCount:g.areas.length,
  receiveDayCount:g.dates.length,candidateMatched:!!candidate,
  origin:'local-matrix-not-provider-attested'
 });
}
