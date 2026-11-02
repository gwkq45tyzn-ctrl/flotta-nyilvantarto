/**
 * Read-only vehicle inventory view for AKE staff.
 * Zero lock != physical presence: never label such a car "verified free".
 * No Google Sheets, manual Fleet overrides, or inferred key handovers.
 */
import {PLATE} from './core.mjs';
export function buildFleetOverview({vehicles,locks,sessions}={}){
 if(!Array.isArray(vehicles)||!Array.isArray(locks)||!Array.isArray(sessions))
  return {ready:false,rows:[],unmatchedLocks:[]};
 const locksByPlate=new Map();
 for(const lock of locks){
  const plate=PLATE(lock?.plate||lock?.id);
  if(!plate)continue;
  locksByPlate.set(plate,[...(locksByPlate.get(plate)||[]),lock]);
 }
 const sessionsById=new Map(sessions.filter(x=>x?.id).map(x=>[x.id,x]));
 const carIds=new Set(),rows=[],seen=new Set();
 for(const v of vehicles){
  const plate=PLATE(v?.plate||v?.id);
  if(!plate)continue;
  carIds.add(plate);
  const duplicates=seen.has(plate);seen.add(plate);
  const matches=locksByPlate.get(plate)||[];
  const base={plate,masterStatus:v.status||'Ismeretlen',driverId:'',sessionId:''};
  if(duplicates||matches.length>1){
   rows.push({...base,state:'review_required',text:'Duplikált vagy ütköző autóadat – ellenőrizendő'});
   continue;
  }
  if(matches.length){
   const lock=matches[0],session=sessionsById.get(lock.sessionId);
   const dataMatch=session&&PLATE(session.plate)===plate&&session.id===lock.sessionId
     &&session.uid===lock.uid&&session.driverId===lock.driverId;
   if(!dataMatch||session.status!==lock.state||v.status!=='Elérhető'){
    rows.push({...base,state:'review_required',text:'Eltérő autóátvételi adatok – ellenőrizendő',
     driverId:String(lock.driverId||''),sessionId:String(lock.sessionId||'')});
   }else if(lock.state==='active'){
    rows.push({...base,state:'active',text:'Használatban',driverId:lock.driverId,sessionId:session.id});
   }else if(lock.state==='awaiting_review'){
    rows.push({...base,state:'awaiting_review',text:'Visszaadás ellenőrzésre vár',
     driverId:lock.driverId,sessionId:session.id});
   }else{
    rows.push({...base,state:'review_required',text:'Ismeretlen autózár – ellenőrizendő',
     driverId:String(lock.driverId||''),sessionId:String(lock.sessionId||'')});
   }
  }else if(v.status==='Elérhető'){
   rows.push({...base,state:'no_active_session',text:'Nincs aktív Attendance-kiadás; fizikai jelenlét nem igazolt'});
  }else{
   rows.push({...base,state:'unavailable',text:'Törzsadat szerint: '+String(v.status||'Ismeretlen')});
  }
 }
 rows.sort((a,b)=>a.plate.localeCompare(b.plate));
 const unmatchedLocks=[...locksByPlate].filter(([plate])=>!carIds.has(plate))
  .flatMap(([plate,items])=>items.map(lock=>({plate,driverId:lock.driverId||'',
   text:'Autózárhoz nincs ismert autótörzs – ellenőrizendő'})));
 return {ready:true,rows,unmatchedLocks};
}
