/** Company-car courier availability, independent of vehicle assignments and Sheets. */
import {PLATE,validPlate} from './core.mjs';
const validDay=v=>{if(!/^20\d\d-\d\d-\d\d$/.test(String(v??'')))return false;const d=new Date(v+'T12:00:00Z');return Number.isFinite(d.valueOf())&&d.toISOString().slice(0,10)===v;};
export function planCourierDay({date,driverId,status}={}){
 if(!validDay(date)||typeof driverId!=='string'||!/^[A-Z0-9_-]{4,40}$/.test(driverId))
  return {ok:false,reason:'Érvénytelen nap vagy DA-kód.'};
 if(!['planned','confirmed','cancelled'].includes(status))
  return {ok:false,reason:'Érvénytelen jelenléti státusz.'};
 return {ok:true,id:date+'__'+driverId,date,driverId,status};
}
export function planCapacity({date,vehicles=[],locks=[],driverLocks,plans=[],accesses=[]}={}){
 if(!validDay(date))return {ready:false,reason:'Érvénytelen tervezési dátum.'};
 if(![vehicles,locks,driverLocks,plans,accesses].every(Array.isArray))return {ready:false,reason:'Hiányzó megbízható adatforrás, DA-kódos autózár is kötelező.'};
 const companyDrivers=new Set(accesses.filter(x=>x.active===true&&typeof x.driverId==='string').map(x=>x.driverId));
 const dayPlans=plans.filter(p=>p.date===date&&companyDrivers.has(p.driverId));
 const planned=new Set(dayPlans.filter(x=>x.status==='planned'||x.status==='confirmed').map(x=>x.driverId));
 const confirmed=new Set(dayPlans.filter(x=>x.status==='confirmed').map(x=>x.driverId));
 // Normalize all plates identically to the real check-in/vehicle lock flow:
 // ABC-123 and ABC123 are the SAME car. Do not silently overcount either.
 const carPlates=vehicles.map(x=>PLATE(x?.plate||x?.id));
 if(carPlates.some(x=>!validPlate(x))||new Set(carPlates).size!==carPlates.length)
  return {ready:false,reason:'Az autótörzsben érvénytelen vagy ismétlődő rendszám szerepel.'};
 const lockPlates=locks.map(x=>PLATE(x?.plate||x?.id));
 if(lockPlates.some(x=>!validPlate(x)||!carPlates.includes(x))
    ||new Set(lockPlates).size!==lockPlates.length)
  return {ready:false,reason:'Az autózárak között ismeretlen vagy ütköző rendszám található.'};
 // A canonical DA-code lock is authoritative alongside the plate lock.
 // Orphan/mismatched locks MUST NOT inflate the "not digitally locked" count.
 const locksByPlate=new Map(locks.map((lock,i)=>[lockPlates[i],lock]));
 const locksByDriver=new Map();
 for(const dLock of driverLocks){
  const driverId=String(dLock?.driverId||dLock?.id||'');
  const plate=PLATE(dLock?.plate);
  if(!/^[A-Z0-9_-]{4,40}$/.test(driverId)||!validPlate(plate)
     ||!carPlates.includes(plate)||locksByDriver.has(driverId))
   return {ready:false,reason:'Érvénytelen, ismétlődő vagy ismeretlen DA-kódos autózár.'};
  locksByDriver.set(driverId,{...dLock,driverId,plate});
 }
 const agrees=(a,b)=>Boolean(a&&b&&a.driverId===b.driverId
  &&PLATE(a.plate)===PLATE(b.plate)
  &&typeof a.uid==='string'&&a.uid.length>0&&a.uid===b.uid
  &&typeof a.sessionId==='string'&&a.sessionId.length>0&&a.sessionId===b.sessionId
  &&['active','awaiting_review'].includes(a.state)&&a.state===b.state);
 if(locks.some(lock=>!agrees(lock,locksByDriver.get(lock?.driverId)))
     ||[...locksByDriver.values()].some(lock=>!agrees(lock,locksByPlate.get(lock.plate))))
  return {ready:false,reason:'Az autózár és a DA-kódos zár nem egyezik: kézi ellenőrzés szükséges.'};
 const working=vehicles.filter(x=>x.status==='Elérhető');
 const locked=new Set(lockPlates);
 // Historical API field name retained; NOT proof of physical presence.
 const physicallyReady=working.filter(x=>!locked.has(PLATE(x.plate||x.id))).length;
 const workingIds=new Set(working.map(x=>PLATE(x.plate||x.id)));
 const inUseCars=new Set(locks.filter(x=>x.state==='active'&&workingIds.has(PLATE(x.plate))).map(x=>PLATE(x.plate))).size;
 const awaitingReviewCars=new Set(locks.filter(x=>x.state==='awaiting_review'&&workingIds.has(PLATE(x.plate))).map(x=>PLATE(x.plate))).size;
 return {ready:true,date,operationalCars:working.length,physicallyReady,
  plannedCouriers:planned.size,confirmedCouriers:confirmed.size,
  missingConfirmed:Math.max(0,working.length-confirmed.size),
  missingPlanned:Math.max(0,working.length-planned.size),
  unverifiedCars:working.length-physicallyReady,
  inUseCars,awaitingReviewCars,
  potentialUtilization:Math.min(working.length,confirmed.size)};
}
