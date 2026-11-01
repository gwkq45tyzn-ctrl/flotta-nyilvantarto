/** Company-car courier availability, independent of vehicle assignments and Sheets. */
const validDay=v=>{if(!/^20\d\d-\d\d-\d\d$/.test(String(v??'')))return false;const d=new Date(v+'T12:00:00Z');return Number.isFinite(d.valueOf())&&d.toISOString().slice(0,10)===v;};
export function planCourierDay({date,driverId,status}={}){
 if(!validDay(date)||typeof driverId!=='string'||!/^[A-Z0-9_-]{4,40}$/.test(driverId))
  return {ok:false,reason:'Érvénytelen nap vagy DA-kód.'};
 if(!['planned','confirmed','cancelled'].includes(status))
  return {ok:false,reason:'Érvénytelen jelenléti státusz.'};
 return {ok:true,id:date+'__'+driverId,date,driverId,status};
}
export function planCapacity({date,vehicles=[],locks=[],plans=[],accesses=[]}={}){
 if(!validDay(date))return {ready:false,reason:'Érvénytelen tervezési dátum.'};
 if(![vehicles,locks,plans,accesses].every(Array.isArray))return {ready:false,reason:'Hiányzó megbízható adatforrás.'};
 const companyDrivers=new Set(accesses.filter(x=>x.active===true&&typeof x.driverId==='string').map(x=>x.driverId));
 const dayPlans=plans.filter(p=>p.date===date&&companyDrivers.has(p.driverId));
 const planned=new Set(dayPlans.filter(x=>x.status==='planned'||x.status==='confirmed').map(x=>x.driverId));
 const confirmed=new Set(dayPlans.filter(x=>x.status==='confirmed').map(x=>x.driverId));
 const working=vehicles.filter(x=>x.status==='Elérhető');
 const locked=new Set(locks.map(x=>x.plate));
 const physicallyReady=working.filter(x=>!locked.has(x.plate||x.id)).length;
 return {ready:true,date,operationalCars:working.length,physicallyReady,
  plannedCouriers:planned.size,confirmedCouriers:confirmed.size,
  missingConfirmed:Math.max(0,working.length-confirmed.size),
  missingPlanned:Math.max(0,working.length-planned.size),
  unverifiedCars:working.length-physicallyReady,
  potentialUtilization:Math.min(working.length,confirmed.size)};
}
