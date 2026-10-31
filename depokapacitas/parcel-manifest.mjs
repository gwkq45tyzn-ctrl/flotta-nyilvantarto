/**
 * Privacy-preserving, in-browser parcel manifest preview.
 * Never uploads tracking IDs, never writes Firestore, and never treats
 * aggregate New/Retry counts as parcel-level deduplicated evidence.
 */
import {parseDay} from './import-dates.mjs';
import {verifyParcelDemand} from './district-capacity.mjs';

const key=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .toLocaleLowerCase('hu-HU').replace(/[^a-z0-9]/g,'');
const find=(row,headers)=>{
  const entries=Object.entries(row??{});
  for(const name of headers){
    const item=entries.find(([k])=>key(k)===key(name));
    if(item)return item[1];
  }
  return '';
};
const district=v=>String(v??'').trim().toLocaleUpperCase('hu-HU').replaceAll('/','-');
const kinds={
 new:'new',uj:'new',ujcsomag:'new',newparcel:'new',newpackages:'new',
 retry:'retry',redelivery:'retry',retrydelivery:'retry',
 ujrakezbesites:'retry',ujrakezbesitendo:'retry',ismeteltsikertelen:'retry'
};
export function previewParcelManifest(rawRows,{date,storedDemands=[],sourceReady=false}={}){
  if(!Array.isArray(rawRows)||rawRows.length>5000)throw Error('Legfeljebb 5000 csomagsor ellenőrizhető.');
  // Parse only explicitly named fields; an unknown status cannot silently
  // become a new or retry parcel.
  const normalized=[],inputErrors=[];
  for(let i=0;i<rawRows.length;i++){
    const row=rawRows[i];
    const eventDate=parseDay(find(row,['Date','Dátum','Nap','Work Date']));
    const trackingId=String(find(row,['Tracking ID','TrackingId','AWB','Parcel ID','Csomagszám','Csomagazonosító','Vonalkód'])).trim().toUpperCase();
    const area=district(find(row,['District','Kerület','Area']));
    const rawKind=find(row,['Kind','Type','Category','Típus','Kategória','Csomag típusa']);
    const kind=kinds[key(rawKind)]||'';
    if(!eventDate||!trackingId||trackingId.length>100||!area||area.length>60||!kind){
      inputErrors.push({line:i+2,reason:'missing_or_invalid_required_value'});
      continue;
    }
    normalized.push({date:eventDate,trackingId,district:area,kind});
  }
  const verified=verifyParcelDemand(normalized,{date});
  const ready=inputErrors.length===0&&verified.verified;
  const selected=storedDemands.filter(x=>x.date===date);
  const byDistrict=new Map();
  for(const row of selected){
    const d=district(row.district);
    if(!byDistrict.has(d))byDistrict.set(d,[]);
    byDistrict.get(d).push(row);
  }
  const actual=new Map(verified.districts.map(x=>[x.district,x]));
  const all=[...new Set([...actual.keys(),...byDistrict.keys()])].sort((a,b)=>a.localeCompare(b,'hu'));
  const comparisons=all.map(d=>{
    const m=actual.get(d),records=byDistrict.get(d)||[];
    const store=records.length===1?records[0]:null;
    const match=Boolean(m&&store&&Number.isSafeInteger(store.newCount)&&
      Number.isSafeInteger(store.retryCount)&&m.newCount===store.newCount&&
      m.retryCount===store.retryCount);
    return {district:d,manifestNew:m?.newCount??null,manifestRetry:m?.retryCount??null,
      storedNew:store?.newCount??null,storedRetry:store?.retryCount??null,
      status:!m?'missing_manifest':!store?'missing_aggregate':match?'match':'mismatch'};
  });
  const comparisonStatus=!sourceReady?'source_unavailable':!ready?'invalid_manifest':
    comparisons.length>0&&comparisons.every(x=>x.status==='match')?'match':'mismatch';
  return {date,verified:ready,uniqueCount:verified.uniqueCount,
    duplicateCount:verified.issues.filter(x=>x.reason==='duplicate_parcel').length,
    inputErrors,issues:verified.issues.map(x=>({reason:x.reason,line:x.line??null})),comparisons,comparisonStatus,
    hasRecords:verified.hasRecords,
    // Never return raw tracking IDs: callers only receive diagnostic counts.
    invalidCount:inputErrors.length+verified.issues.filter(x=>x.reason!=='duplicate_parcel').length
  };
}
