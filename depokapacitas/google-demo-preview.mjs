/**
 * Read-only boundary for a private, SYNTHETIC Google Sheets Apps Script export.
 * This is NOT a trusted source and NEVER commits to Firestore/Google Sheets.
 * Keep entirely separate from the business CSV/XLSX import path.
 */
export const MAX_GOOGLE_DEMO_BYTES=128*1024;
export const MAX_GOOGLE_DEMO_DISTRICTS=30;
const LIMIT=10000000;
const day=v=>{
 if(typeof v!=='string'||!/^20\d{2}-\d{2}-\d{2}$/.test(v))return false;
 const d=new Date(v+'T12:00:00Z');
 return Number.isFinite(d.valueOf())&&d.toISOString().slice(0,10)===v;
};
const validDistrict=v=>typeof v==='string'&&v===v.trim()&&/^[A-Z0-9 -]{1,30}$/.test(v);
const count=v=>Number.isSafeInteger(v)&&v>=0&&v<=LIMIT;
function keys(value,names){
 return value&&typeof value==='object'&&!Array.isArray(value)
   &&Object.keys(value).length===names.length
   &&Object.keys(value).every(k=>names.includes(k));
}
const FAIL=reason=>{throw Error('GOOGLE_DEMO_'+reason);};
export function previewGoogleDemoExport(raw){
 if(typeof raw!=='string'||new TextEncoder().encode(raw).byteLength>MAX_GOOGLE_DEMO_BYTES)FAIL('FILE_LIMIT');
 let data;try{data=JSON.parse(raw);}catch{FAIL('INVALID_JSON');}
 if(!data||!['imile.demo-demand.v1','imile.demo-demand.v2'].includes(data.schema))FAIL('INVALID_SCHEMA');
 const v2=data.schema==='imile.demo-demand.v2';
 const required=['schema','source','date','revision','verifiedByTrackingId','authoritative','demands'];
 if(v2)required.push('draftCapacities','estimatedOnly');
 if(!keys(data,required)||data.source!=='synthetic-google-sheet'||data.verifiedByTrackingId!==false||data.authoritative!==false
    ||!day(data.date)||!Number.isSafeInteger(data.revision)||data.revision<1||data.revision>1000000
    ||!Array.isArray(data.demands)||!data.demands.length||data.demands.length>MAX_GOOGLE_DEMO_DISTRICTS)FAIL('INVALID_SCHEMA');
 if(v2&&(data.estimatedOnly!==true||!Array.isArray(data.draftCapacities)||data.draftCapacities.length!==data.demands.length))
   FAIL('INVALID_DRAFTS');
 const byDistrict=new Map();
 for(const d of data.demands){
  if(!keys(d,['id','date','district','newCount','retryCount'])||d.date!==data.date||!validDistrict(d.district)
     ||d.id!==data.date+'__'+d.district||!count(d.newCount)||!count(d.retryCount)
     ||d.newCount+d.retryCount>LIMIT||byDistrict.has(d.district))FAIL('INVALID_DEMAND');
  byDistrict.set(d.district,{date:data.date,district:d.district,newCount:d.newCount,retryCount:d.retryCount,
    demand:d.newCount+d.retryCount,plannedCapacity:null,confirmedCapacity:null,plannedGap:null,confirmedGap:null});
 }
 if(v2){
  const seen=new Set();
  for(const cap of data.draftCapacities){
   if(!keys(cap,['district','plannedCapacity','confirmedCapacity'])||!validDistrict(cap.district)
      ||!byDistrict.has(cap.district)||seen.has(cap.district)||!count(cap.plannedCapacity)
      ||!count(cap.confirmedCapacity)||cap.confirmedCapacity>cap.plannedCapacity)FAIL('INVALID_DRAFTS');
   seen.add(cap.district);
   const row=byDistrict.get(cap.district);
   row.plannedCapacity=cap.plannedCapacity;row.confirmedCapacity=cap.confirmedCapacity;
   row.plannedGap=cap.plannedCapacity-row.demand;row.confirmedGap=cap.confirmedCapacity-row.demand;
  }
  if(seen.size!==byDistrict.size)FAIL('INVALID_DRAFTS');
 }
 const rows=[...byDistrict.values()].sort((a,b)=>a.district.localeCompare(b.district,'hu'));
 const sum=(key)=>rows.reduce((total,row)=>total+row[key],0);
 return {
  status:'synthetic-preview-only',date:data.date,revision:data.revision,rows,verifiedByTrackingId:false,
  authoritative:false,canCommit:false,
  totalNew:sum('newCount'),totalRetry:sum('retryCount'),totalDemand:sum('demand'),
  plannedCapacity:v2?sum('plannedCapacity'):null,
  confirmedCapacity:v2?sum('confirmedCapacity'):null,
  plannedGap:v2?sum('plannedGap'):null,
  confirmedGap:v2?sum('confirmedGap'):null,
  warning:'Szintetikus, kézzel megadott becslés. Nem igazolt csomaglista, jelenlét, futár- vagy autókapacitás. Nem került az adatbázisba.'
 };
}
