/**
 * QA-only, source-backed comparison of a parcel-level preview against the
 * existing per-district daily demand plan. Does NOT import, reconcile or write.
 *
 * No automatic district aliases or source-schema approval is inferred.
 * UI wiring remains blocked until the real mapping and ID semantics are signed off.
 */
const validDay=d=>typeof d==='string'&&/^20\d{2}-\d{2}-\d{2}$/.test(d)&&
  Number.isFinite(Date.parse(d+'T12:00:00Z'))&&new Date(d+'T12:00:00Z').toISOString().slice(0,10)===d;
const count=n=>Number.isSafeInteger(n)&&n>=0&&n<=10000000;
const canonicalArea=(v,mode)=>{
  if(typeof v!=='string'||!v.trim()||v.length>60)return null;
  return mode==='legacy-preview'?v.trim().toLocaleUpperCase('hu-HU').replaceAll('/','-'):v;
};
const issue=(reason,district=null)=>({reason,district});
const empty=(status,why)=>({
  status,readOnly:true,writesAllowed:false,authoritative:false,
  matchCount:null,mismatchCount:null,rows:[],totals:null,
  issues:[issue(why)]
});
const namedDate=({date,canonicalRows})=>
  date||(Array.isArray(canonicalRows)&&canonicalRows.length>0&&
    canonicalRows.every(x=>x?.date===canonicalRows[0]?.date)?canonicalRows[0].date:null);

/**
 * For approved production integrations, a distinct, separately audited gate is
 * required. This helper never declares the business plan verified.
 *
 * @param preview Result of #5 previewParcelImport or #8 adaptParcelSource.
 * @param demands Read-only snapshot of the district demand collection.
 * @param options Selected day + assessSources() snapshot and explicit area policy.
 */
export function compareParcelPreviewToDemands(preview,demands,
  {date,sourceHealth,districtMode=null}={}){
  if(!validDay(date))return empty('blocked','invalid_selected_day');
  if(districtMode!=='exact'&&districtMode!=='legacy-preview')
    return empty('blocked','district_equivalence_unapproved');
  if(!sourceHealth||sourceHealth.status!=='ready'||sourceHealth.trusted!==true||
    !Number.isFinite(sourceHealth.confirmedAt)||sourceHealth.confirmedAt<=0)
    return empty('source-untrusted','no_current_server_confirmation');
  if(!preview||typeof preview!=='object'||preview.importAllowed===true||
    preview.writesAllowed===true)
    return empty('blocked','not_a_readonly_preview');
  const legacy=preview.status==='verified'&&preview.verified===true;
  const adapter=preview.status==='preview'&&preview.importAllowed===false;
  if(!legacy&&!adapter)return empty('blocked','parcel_preview_not_verified');
  if(namedDate(preview)!==date)return empty('blocked','parcel_preview_day_mismatch');
  if(!Array.isArray(preview.districts)||!count(preview.uniqueCount)||
    preview.uniqueCount===0||!Array.isArray(demands))
    return empty('blocked','parcel_preview_or_demands_missing');
  if(adapter&&(!Array.isArray(preview.canonicalRows)||
    preview.canonicalRows.length!==preview.uniqueCount||
    !preview.canonicalRows.every(x=>x?.date===date)))
    return empty('blocked','adapter_rows_not_in_selected_day');
  const actual=new Map(),planned=new Map(),problems=[];
  let parcelTotal=0;
  for(const row of preview.districts){
    const area=canonicalArea(row?.district,districtMode);
    if(!area||!count(row?.newCount)||!count(row?.retryCount)||
      row.newCount+row.retryCount>10000000||actual.has(area)){
      problems.push(issue('invalid_or_duplicate_preview_district',area));continue;
    }
    parcelTotal+=row.newCount+row.retryCount;
    if(!Number.isSafeInteger(parcelTotal))problems.push(issue('preview_total_overflow'));
    actual.set(area,{newCount:row.newCount,retryCount:row.retryCount});
  }
  if(parcelTotal!==preview.uniqueCount)problems.push(issue('parcel_unique_total_mismatch'));
  for(const row of demands){
    if(row?.date!==date)continue;
    const area=canonicalArea(row?.district,districtMode);
    if(!area){problems.push(issue('invalid_plan_district'));continue;}
    if(!planned.has(area))planned.set(area,[]);
    planned.get(area).push(row);
  }
  if(problems.length)return {...empty('blocked','invalid_comparison_inputs'),issues:problems};
  const all=[...new Set([...actual.keys(),...planned.keys()])].sort((a,b)=>a.localeCompare(b,'hu'));
  if(!all.length)return empty('blocked','no_comparable_districts');
  const rows=all.map(area=>{
    const parcel=actual.get(area),source=planned.get(area)||[],plan=source.length===1?source[0]:null;
    const validPlan=plan&&count(plan.newCount)&&count(plan.retryCount)&&
      plan.newCount+plan.retryCount<=10000000;
    let state='match';
    if(!parcel)state='missing_parcel_district';
    else if(source.length>1)state='duplicate_plan_district';
    else if(!plan)state='missing_plan_district';
    else if(!validPlan)state='invalid_plan_counts';
    else if(parcel.newCount!==plan.newCount||parcel.retryCount!==plan.retryCount)
      state='count_mismatch';
    return {
      district:area,
      previewNew:parcel?.newCount??null,previewRetry:parcel?.retryCount??null,
      planNew:validPlan?plan.newCount:null,planRetry:validPlan?plan.retryCount:null,
      newDelta:parcel&&validPlan?parcel.newCount-plan.newCount:null,
      retryDelta:parcel&&validPlan?parcel.retryCount-plan.retryCount:null,
      status:state
    };
  });
  const matches=rows.filter(r=>r.status==='match').length;
  return {
    status:matches===rows.length?'preview-match':'preview-differences',
    readOnly:true,writesAllowed:false,authoritative:false,
    // Even a perfect match does not prove source freshness or parcel identity.
    sourceSchemaApproved:false,
    date,sourceConfirmedAt:sourceHealth.confirmedAt,
    matchCount:matches,mismatchCount:rows.length-matches,
    rows,
    totals:{
      previewNew:rows.every(r=>r.previewNew!==null)?rows.reduce((sum,r)=>sum+r.previewNew,0):null,
      previewRetry:rows.every(r=>r.previewRetry!==null)?rows.reduce((sum,r)=>sum+r.previewRetry,0):null,
      planNew:rows.every(r=>r.planNew!==null)?rows.reduce((s,r)=>s+r.planNew,0):null,
      planRetry:rows.every(r=>r.planRetry!==null)?rows.reduce((s,r)=>s+r.planRetry,0):null
    },
    issues:rows.filter(r=>r.status!=='match').map(r=>issue(r.status,r.district))
  };
}
