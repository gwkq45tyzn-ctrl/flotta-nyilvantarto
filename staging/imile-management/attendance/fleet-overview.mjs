/**
 * Read-only vehicle inventory view for AKE staff.
 * Zero lock != physical presence: never label such a car "verified free".
 * No Google Sheets, manual Fleet overrides, or inferred key handovers.
 */
import {PLATE} from './core.mjs';
export function buildFleetOverview({vehicles,locks,sessions,driverLocks}={}){
 if(!Array.isArray(vehicles)||!Array.isArray(locks)||!Array.isArray(sessions)||!Array.isArray(driverLocks))
  return {ready:false,rows:[],unmatchedLocks:[]};
 const locksByPlate=new Map();
 for(const lock of locks){
  const plate=PLATE(lock?.plate||lock?.id);
  if(!plate)continue;
  locksByPlate.set(plate,[...(locksByPlate.get(plate)||[]),lock]);
 }
 const sessionsById=new Map(sessions.filter(x=>x?.id).map(x=>[x.id,x]));
 const daLocks=new Map();
 for(const lock of driverLocks){
  const driverId=String(lock?.driverId||lock?.id||'');
  daLocks.set(driverId,[...(daLocks.get(driverId)||[]),lock]);
 }
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
   const matchingDaLocks=daLocks.get(String(lock.driverId||''))||[];
   const daLock=matchingDaLocks[0];
   const driverMatches=matchingDaLocks.length===1&&daLock.sessionId===lock.sessionId
    &&daLock.uid===lock.uid&&daLock.driverId===lock.driverId
    &&PLATE(daLock.plate)===plate&&daLock.state===lock.state;
   const dataMatch=session&&PLATE(session.plate)===plate&&session.id===lock.sessionId
     &&session.uid===lock.uid&&session.driverId===lock.driverId&&driverMatches;
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
  }else if(driverLocks.some(x=>PLATE(x.plate)===plate)){
   rows.push({...base,state:'review_required',text:'DA-kód foglalja az autót, de autózár hiányzik – ellenőrizendő'});
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
 for(const [driverId,items] of daLocks){
  for(const daLock of items){
   const paired=(locksByPlate.get(PLATE(daLock.plate))||[])
    .some(lock=>lock.driverId===driverId&&lock.sessionId===daLock.sessionId
     &&lock.uid===daLock.uid&&lock.state===daLock.state);
   if(!paired||items.length>1)unmatchedLocks.push({
    plate:PLATE(daLock.plate),driverId,
    text:'DA-kód szerinti autózár nem illeszkedik a tényleges kiadáshoz – ellenőrizendő'
   });
  }
 }
 return {ready:true,rows,unmatchedLocks};
}
