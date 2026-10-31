/**
 * SERVER-SIDE raw export reconciliation (pure and side-effect free).
 * This is NOT provider attestation and must NEVER be described as proving the
 * origin of an iMile export. A server must receive the original raw matrix
 * through an independently authorized source adapter, not a browser claim.
 *
 * No waybill, address or raw DA row is persisted by this module.
 */
import {inhub,ofd} from '../report-core.mjs';
import {planPerformanceSnapshots} from '../report-statistics.mjs';
import {planInventorySnapshot} from '../inventory-statistics.mjs';
import {validateTrustedReport} from './trusted-report-validation.mjs';

const MAX_ROWS=10002;
const MAX_COLS=100;
const MAX_SOURCE_CELLS=150000;
const MAX_SOURCE_BYTES=4*1024*1024;
const MAX_CELL_BYTES=4096;
const primitive=x=>x===null||typeof x==='string'||typeof x==='number'||
 typeof x==='boolean'||x instanceof Date||x===undefined;
function ensureMatrix(matrix){
 if(!Array.isArray(matrix)||matrix.length<2||matrix.length>MAX_ROWS)
  throw Error('invalid_source_matrix');
 let cells=0,bytes=0;
 for(const row of matrix){
  if(!Array.isArray(row)||row.length>MAX_COLS)throw Error('invalid_source_cells');
  cells+=row.length;
  if(cells>MAX_SOURCE_CELLS)throw Error('raw_source_limit_exceeded');
  for(const value of row){
   if(!primitive(value))throw Error('invalid_source_cells');
   const length=Buffer.byteLength(value instanceof Date?String(value.getTime()):
    value==null?'':String(value),'utf8');
   if(length>MAX_CELL_BYTES)throw Error('raw_source_limit_exceeded');
   bytes+=length;
   if(bytes>MAX_SOURCE_BYTES)throw Error('raw_source_limit_exceeded');
  }
 }
 return matrix;
}
export function reconcileWithRawExport({kind,candidate,rawMatrix}={}){
 if(!['ofd','inhub'].includes(kind))throw Error('invalid_report_kind');
 ensureMatrix(rawMatrix);
 // Validate submitted totals and daily key independently of raw processing.
 const supplied=validateTrustedReport(kind,candidate);
 let original;
 try{original=kind==='ofd'?ofd(rawMatrix):inhub(rawMatrix);}
 catch{throw Error('raw_source_schema_invalid');}
 if(original.status!=='ready')
  throw Error('raw_source_'+(original.status==='blocked'?'blocked':'missing'));
 let expected;
 if(kind==='ofd'){
  let groups;
  try{groups=planPerformanceSnapshots(original);}
  catch{throw Error('raw_source_daily_conflict');}
  // A single file must exactly represent one day and one depot. Reject
  // partial matches, which could otherwise certify omitted daily rows.
  if(groups.length!==1)throw Error('raw_source_multiple_days_or_stations');
  const g=groups[0];
  expected={
   key:g.key,date:g.date,station:g.station,rows:g.rows,
   totalOFD:g.totalOFD,totalDelivered:g.totalDelivered,courierCount:g.courierCount
  };
 }else{
  let g;
  try{g=planInventorySnapshot(original,rawMatrix,candidate.date);}
  catch{throw Error('raw_source_inventory_station_or_day_invalid');}
  expected={key:g.key,date:g.date,station:g.station,dates:g.dates,
   areas:g.areas,total:g.total};
 }
 const derived=validateTrustedReport(kind,expected);
 if(derived.contentHash!==supplied.contentHash)
  throw Error('raw_source_report_mismatch');
 // In-memory source matrix gets no persistence; never label this as provider
 // authenticated. The caller must not rely on an untrusted browser upload as
 // independent corroboration.
 return Object.freeze({
  matching:true,
  kind,
  reportKey:derived.snapshot.key,
  contentHash:derived.contentHash,
  sourceRows:original.sourceRows,
  validation:'raw-matrix-reconciled-not-provider-attested'
 });
}
