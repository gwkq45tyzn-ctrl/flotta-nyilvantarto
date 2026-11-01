/**
 * Read-only shared Depot + Fleet alerts. Both modules use the same staging
 * Firestore collections; this function never writes or acknowledges records.
 *
 * Fleet expiry logic is deliberately imported rather than reimplemented:
 * the depot must not silently use different expiry windows from Fleet.
 */
import {expiryWarnings, schemas, validDate} from './fleet/operations-data.mjs';
import {normalizeAttendanceVehicleEvent} from './attendance-handover.mjs';

const priority={urgent:0,warning:1,upcoming:2,info:3};
const levelForDays=days=>days<=7?'urgent':days<=30?'warning':'upcoming';
const norm=v=>String(v??'').trim().toUpperCase().replace(/[\s-]+/g,'');
const dateDays=(a,b)=>Math.round((Date.parse(a+'T12:00:00Z')-Date.parse(b+'T12:00:00Z'))/86400000);
const safeArray=value=>Array.isArray(value)?value:[];
const recordVehicleId=row=>norm(row?.data?.vehicleId||row?.vehicleId||'');
const sentence=days=>days<0?'Lejárt '+(-days)+' napja':days===0?'Ma esedékes':days+' nap múlva esedékes';
const add=(list,x)=>list.push({...x,source:'Flotta',actionUrl:'../staging/imile-management/fleet/operations.html'});
export function collectFleetAlerts({
  today,vehicles=[],drivers=[],fleetRecords=[],fleetAssignments=[],bookings=[],attendance=[]
}={}){
  if(!validDate(today))throw Error('Érvénytelen ellenőrzési dátum');
  const alerts=[];
  const rows=safeArray(fleetRecords).filter(x=>x&&x.data&&schemas[x.kind]);
  const knownVehicles=new Map(safeArray(vehicles).map(x=>[norm(x.plate||x.id),x]));
  const knownDrivers=new Map(safeArray(drivers).map(x=>[norm(x.daCode||x.id),x]));
  const serviceDates=new Set();
  for(const row of rows.filter(x=>x.kind==='service')){
    const vid=recordVehicleId(row),day=row.data.date;
    if(!vid||!validDate(day))continue;
    const days=dateDays(day,today);
    if(days<0||days>60)continue;
    serviceDates.add(vid+'|'+day);
    const vehicle=knownVehicles.get(vid);
    add(alerts,{id:'fleet-service:'+String(row.id),type:'service',level:levelForDays(days),
      title:(vehicle?.plate||vid)+' – tervezett szerviz',detail:sentence(days)+(row.data.provider?' · '+row.data.provider:''),
      dueDate:day,days,vehicleId:vid});
  }
  // Exactly the same expiry threshold / field selection as the Fleet module.
  for(const warning of expiryWarnings(rows,today)){
    const record=rows.find(x=>x.id===warning.id);
    if(!record)continue;
    const {field,date,days}=warning;
    const vid=recordVehicleId(record);
    if(field==='nextServiceDate'&&serviceDates.has(vid+'|'+date))continue;
    const def=schemas[record.kind]?.fields.find(x=>x.key===field);
    const label=def?.label||field;
    const key=record.kind==='driver'?norm(record.data.driverId):
      record.kind==='fuel'?norm(record.data.code):record.kind==='vehicle'?vid:record.id;
    const subject=record.kind==='driver'?(knownDrivers.get(key)?.name||key):
      record.kind==='fuel'?'Tankolókártya '+key:
      (knownVehicles.get(vid)?.plate||vid||String(key));
    add(alerts,{id:'fleet-expiry:'+warning.id+':'+field,type:'expiry',
      level:levelForDays(days),title:subject+' – '+label,
      detail:sentence(days),days,dueDate:date,vehicleId:vid||null});
  }
  for(const vehicle of safeArray(vehicles)){
    const id=norm(vehicle.plate||vehicle.id);
    if(!id)continue;
    if(vehicle.status==='Szerviz'||vehicle.status==='Leállított'){
      add(alerts,{id:'fleet-status:'+id,type:'unavailable',level:'urgent',
        title:(vehicle.plate||id)+(vehicle.status==='Szerviz'?' – szervizben':' – leállított'),
        detail:'Nem tervezhető kiszállításra · járműállapot ellenőrzése',
        dueDate:today,days:0,vehicleId:id});
    }
  }
  const assignments=new Map(safeArray(fleetAssignments).filter(x=>x.active).map(x=>[norm(x.vehicleId||x.id),x]));
  for(const booking of safeArray(bookings)){
    if(!validDate(booking.date)||booking.date<today)continue;
    const vid=norm(booking.vehicleId);
    if(!vid)continue;
    const hasService=rows.some(x=>x.kind==='vehicle'&&recordVehicleId(x)===vid&&x.data.nextServiceDate===booking.date)
      ||rows.some(x=>x.kind==='service'&&recordVehicleId(x)===vid&&x.data.date===booking.date);
    if(hasService){
      add(alerts,{id:'fleet-conflict-service:'+booking.id,type:'conflict',level:'urgent',
        title:vid+' – szerviznapra tervezett autófoglalás',
        detail:'A '+booking.date+' napi beosztást ellenőrizni kell.',dueDate:booking.date,
        days:dateDays(booking.date,today),vehicleId:vid});
    }
    const a=assignments.get(vid);
    if(a&&a.driverId!==booking.driverId&&booking.date===today){
      add(alerts,{id:'fleet-conflict-assignment:'+booking.id,type:'conflict',level:'urgent',
        title:vid+' – eltérő futárhoz kiadott autó',
        detail:'A tényleges kiadás és a mai tervezett foglalás eltér.',dueDate:today,days:0,vehicleId:vid});
    }
  }
  // Flag a real Attendance login that disagrees with today's manual plan.
  // Even if the handover reducer rejects it as a planning conflict, dispatch
  // must see a clear urgent alert instead of silently treating the car as free.
  const seenAttendance=new Set();
  for(const raw of safeArray(attendance)){
    const e=normalizeAttendanceVehicleEvent(raw);
    if(!e.valid||e.type!=='Log In'||!e.vehicleId||
      e.eventTime.slice(0,10)!==today||seenAttendance.has(e.id))continue;
    seenAttendance.add(e.id);
    const booked=safeArray(bookings).find(b=>b.date===today&&norm(b.vehicleId)===e.vehicleId);
    if(booked&&norm(booked.driverId)!==norm(e.daCode)){
      add(alerts,{id:'fleet-conflict-attendance:'+e.id,type:'conflict',level:'urgent',
        title:e.vehicleId+' – Attendance és napi foglalás eltér',
        detail:'A mai járműhasználati bejelentkezés eltérő futárt jelöl. A kiosztást tisztázni kell.',
        dueDate:today,days:0,vehicleId:e.vehicleId});
    }
  }
  return alerts.sort((a,b)=>priority[a.level]-priority[b.level]||
    a.dueDate.localeCompare(b.dueDate)||a.title.localeCompare(b.title,'hu'));
}
