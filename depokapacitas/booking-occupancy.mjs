// Same-day occupancy policy. Future reservations do not reserve today's physical car.
import {deriveAttendanceHandovers} from '../staging/imile-management/attendance-handover.mjs';
import {assessDailyPhysicalUse} from './booking-physical-guard.mjs';
export const depotDay=now=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Budapest',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));
const millis=x=>typeof x?.toMillis==='function'?x.toMillis():typeof x==='number'?x:NaN;
export function assessOccupancy({date,today,vehicleId,driverId='',assignments=[],events=[],drivers=[],vehicles=[],guard,sourcesReady=false,now=Date.now()}={}){
 const deny=reason=>({eligible:false,reason});
 if(!sourcesReady)return deny('unconfirmed_sources');
 if(date>today)return {eligible:true,reason:'other_day'};
 if(date<today)return deny('historical_booking_disallowed');
 for(const a of assignments.filter(x=>x.vehicleId===vehicleId||x.id===vehicleId)){
  if(typeof a.active!=='boolean')return deny('invalid_assignment');
 }
 // Do not pass manualBookings: a contradictory booking must not erase physical use.
 const derived=deriveAttendanceHandovers({events,drivers,vehicles});
 // Reuse #27's single physical conflict implementation, including reverse DA claims.
 const physical=assessDailyPhysicalUse({date,today,vehicleId,driverId:driverId||'QA_UNSELECTED_DRIVER',assignments,handovers:derived.handovers});
 if(!physical.eligible)return deny(physical.reason==='manual_checkout_conflict'?'physical_other_driver':physical.reason==='attendance_checkout_conflict'?'attendance_other_driver':physical.reason);
 if(derived.alerts.some(x=>events.some(e=>e.id===x.eventId&&e.vehicleId===vehicleId&&e.eventTime?.slice(0,10)===today)))return deny('attendance_review');
 const at=millis(guard?.confirmedAt);
 if(!guard||guard.date!==today||guard.vehicleId!==vehicleId||guard.source!=='trusted-attendance-projection-v1'||!Number.isFinite(at)||at>now||now-at>120000)return deny('attendance_guard_missing_or_stale');
 if(guard.state==='clear'&&guard.driverId==='')return {eligible:true,reason:'clear'};
 if(guard.state==='assigned'&&driverId&&guard.driverId===driverId)return {eligible:true,reason:'same_driver'};
 return deny('attendance_guard_occupied');
}
export const occupancyMessage=reason=>({
 unconfirmed_sources:'A foglaláshoz szükséges források még nem szerverrel ellenőrzöttek.',
 physical_other_driver:'Az autó fizikailag már másik futárnak van kiadva.',
 attendance_other_driver:'Az Attendance szerint az autó másik futárnál van.',
 attendance_review:'A jármű Attendance-használata ellenőrzésre vár.',
 attendance_guard_missing_or_stale:'Az aznapi foglalás hiteles Attendance-összesítés hiányában nem engedélyezett. A későbbi napi tervezés elérhető.',
 attendance_guard_occupied:'A hiteles Attendance-állapot alapján az autó nem foglalható ennek a futárnak.',
 invalid_assignment:'A fizikai járműkiadás állapota hiányos.'
}[reason]||'A jármű foglalása jelenleg nem ellenőrizhető.');
