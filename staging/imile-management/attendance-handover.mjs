/**
 * Staging-only: derive driver–vehicle handover state from Mobile Attendance.
 * Pure, read-only; no live Fleet writes and no historical backfill.
 * Future backend must persist claims atomically and apply idempotency keys.
 */
const normDa=value=>String(value??'').trim().toUpperCase();
const normPlate=value=>String(value??'').trim().toUpperCase().replace(/[\s-]+/g,'');
const validDate=value=>{
  if(!/^(19|20|21)\d{2}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(String(value||'')))return false;
  const day=value.slice(0,10),parsed=new Date(day+'T12:00:00Z');
  return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===day;
};
const photoKeys=['photoFront','photoLeft','photoRight','photoBack'];
const hasReturnPhotos=event=>photoKeys.every(key=>typeof event[key]==='string'&&event[key].trim().length>0);
const issue=(alerts,kind,event,detail)=>alerts.push({kind,eventId:event.id??null,detail});
const odometer=value=>value===undefined||value===null?null:
  Number.isSafeInteger(value)&&value>=0&&value<=100000000?value:NaN;
export function normalizeAttendanceVehicleEvent(event){
  const id=String(event?.id??'').trim();
  const daCode=normDa(event?.daCode),vehicleId=normPlate(event?.vehicleId);
  const type=event?.type;
  const eventTime=String(event?.eventTime??'');
  const pickupOdometer=odometer(event?.pickupOdometer);
  const returnOdometer=odometer(event?.returnOdometer);
  if(Number.isNaN(pickupOdometer)||Number.isNaN(returnOdometer))
    return {valid:false,reason:'invalid_odometer',id};
  if(!id || !validDate(eventTime)||event?.timeKnown!==true ||
    !/^[A-Z0-9_-]{4,40}$/.test(daCode)||!['Log In','Log Out'].includes(type)){
    return {valid:false,reason:'invalid_attendance',id};
  }
  if(vehicleId && !/^[A-Z0-9]{4,12}$/.test(vehicleId))
    return {valid:false,reason:'invalid_vehicle',id};
  return {valid:true,id,eventTime,daCode,vehicleId,type,pickupOdometer,returnOdometer,
    photosComplete:hasReturnPhotos(event)};
}
/**
 * Deterministic event reduction. Old attendance rows without a vehicle choice
 * are not interpreted as vehicle pickups. No output triggers writes by itself.
 * The return remains pending if car photos are incomplete.
 */
export function deriveAttendanceHandovers({events=[],drivers=[],vehicles=[],manualBookings=[]}={}){
  const knownDrivers=new Map(drivers.map(x=>[normDa(x.daCode||x.id),x]));
  const knownVehicles=new Map(vehicles.map(x=>[normPlate(x.plate||x.id),x]));
  const alerts=[],handovers=[],activeVehicles=new Map(),activeDrivers=new Map(),seen=new Set();
  const inputs=events.map(normalizeAttendanceVehicleEvent).map((parsed,index)=>({...parsed,index}))
    .sort((a,b)=>(a.eventTime||'').localeCompare(b.eventTime||'')||
      String(a.id||'').localeCompare(String(b.id||''))||a.index-b.index);
  for(const e of inputs){
    if(!e.valid){issue(alerts,e.reason,e,'Az Attendance esemény hiányos vagy érvénytelen.');continue;}
    if(seen.has(e.id)){issue(alerts,'duplicate_event',e,'Ismételt Attendance esemény nem nyit új kiadást.');continue;}
    seen.add(e.id);
    const previous=activeDrivers.get(e.daCode);
    if(e.type==='Log In'){
      if(!e.vehicleId){issue(alerts,'vehicle_not_selected',e,'A futár nem választott autót: nincs automatikus kiadás.');continue;}
      if(e.pickupOdometer===null){
        issue(alerts,'pickup_odometer_missing',e,'Nincs hiteles átvételi km: nem keletkezhet automatikus kiadás.');continue;
      }
      const driver=knownDrivers.get(e.daCode),vehicle=knownVehicles.get(e.vehicleId);
      if(!driver || driver.active!==true){issue(alerts,'driver_unavailable',e,'Futár ismeretlen vagy inaktív.');continue;}
      if(!vehicle || vehicle.status!=='Elérhető'){issue(alerts,'vehicle_unavailable',e,'Autó ismeretlen vagy nem elérhető.');continue;}
      if(previous){issue(alerts,previous.vehicleId===e.vehicleId?'duplicate_checkin':'driver_already_assigned',e,'A futárnak már van nyitott autókiadása.');continue;}
      if(activeVehicles.has(e.vehicleId)){issue(alerts,'vehicle_already_assigned',e,'Az autó már más futárnál van.');continue;}
      const date=e.eventTime.slice(0,10);
      if(manualBookings.some(b=>b.date===date&&(
        (b.vehicleId===e.vehicleId&&b.driverId!==e.daCode)||
        (b.driverId===e.daCode&&b.vehicleId!==e.vehicleId)))){
        issue(alerts,'planning_conflict',e,'A tervezett beosztásban eltérő autó–futár kapcsolat szerepel.');continue;
      }
      const record={id:e.id,driverId:e.daCode,vehicleId:e.vehicleId,
        pickedUpAt:e.eventTime,returnedAt:null,status:'issued',
        sourceCheckInId:e.id,sourceCheckOutId:null,returnPhotosComplete:false,
        pickupOdometer:e.pickupOdometer,returnOdometer:null,drivenKm:null};
      handovers.push(record);activeDrivers.set(e.daCode,record);activeVehicles.set(e.vehicleId,record);
    }else{
      if(!previous){issue(alerts,'orphan_checkout',e,'Nincs nyitott autókiadás ehhez a futárhoz.');continue;}
      if(e.vehicleId&&e.vehicleId!==previous.vehicleId){
        issue(alerts,'checkout_vehicle_mismatch',e,'A visszaadott autó eltér a kiadott autótól.');continue;
      }
      previous.sourceCheckOutId=e.id;
      previous.returnedAt=e.eventTime;
      previous.returnPhotosComplete=e.photosComplete;
      previous.returnOdometer=e.returnOdometer;
      if(!e.photosComplete){
        previous.status='return_review';
        issue(alerts,'return_photos_missing',e,'A visszaadás fotói hiányosak; az autó ellenőrzésig nem szabad.');
      }else if(e.returnOdometer===null){
        previous.status='return_review';
        issue(alerts,'return_odometer_missing',e,'Hiányzik a záró km; a jármű nem szabadítható fel automatikusan.');
      }else if(e.returnOdometer<previous.pickupOdometer){
        previous.status='return_review';
        issue(alerts,'return_odometer_regression',e,'A záró km kisebb az átvételinél; kézi ellenőrzés szükséges.');
      }else{
        previous.status='returned';
        previous.drivenKm=e.returnOdometer-previous.pickupOdometer;
        activeDrivers.delete(e.daCode);
        activeVehicles.delete(previous.vehicleId);
      }
    }
  }
  return {handovers,alerts,
    openVehicleIds:[...activeVehicles.keys()].sort(),
    openDriverIds:[...activeDrivers.keys()].sort()};
}
