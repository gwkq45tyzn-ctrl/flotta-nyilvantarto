// Only built-in synthetic scenarios; deliberately accepts no source rows/mapping.
import {previewParcelImport} from './parcel-preview.mjs';
import {compareParcelPreviewToDemands} from './parcel-demand-reconciliation.mjs';
import {assessSources} from './source-health.mjs';
export const QA_SCENARIOS=Object.freeze(['match','difference','missing-plan','duplicate-plan','missing-parcel','conflict','untrusted']);
export function runSyntheticDemandQa(scenario,{now=Date.now()}={}){
 if(!QA_SCENARIOS.includes(scenario))throw Error('Ismeretlen szintetikus QA-forgatókönyv.');
 const date='2099-02-01';
 const parcels=[{date,trackingId:'SYN_QA_0001',district:'QA_ZONE_A',kind:'new'},{date,trackingId:'SYN_QA_0002',district:'QA_ZONE_A',kind:'retry'}];
 const demands=[{date,district:'QA_ZONE_A',newCount:1,retryCount:1}];
 if(scenario==='difference')demands[0].newCount=2;
 if(scenario==='missing-plan')demands.length=0;
 if(scenario==='duplicate-plan')demands.push({...demands[0]});
 if(scenario==='missing-parcel')demands.push({date,district:'QA_ZONE_B',newCount:0,retryCount:0});
 if(scenario==='conflict')parcels.push({...parcels[0],kind:'retry'});
 const text=JSON.stringify(parcels,null,2),preview=previewParcelImport(text,{date,format:'json',sourceName:'Beépített szintetikus QA'});
 const meta=Object.fromEntries(['demands','bookings','drivers','vehicles'].map(k=>[k,{loaded:true,fromCache:scenario==='untrusted',pending:false,serverAt:now}]));
 // Simulated QA receipt, NOT a statement about any Firestore server or real file.
 const health=assessSources(meta,{now,online:true});
 const comparison=compareParcelPreviewToDemands(preview,demands,{date,sourceHealth:health,districtMode:'exact'});
 return {syntheticOnly:true,date,text,preview,comparison};
}
