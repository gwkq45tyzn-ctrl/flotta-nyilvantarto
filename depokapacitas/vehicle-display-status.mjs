/**
 * Read-only display status for the Depot vehicles table.
 *
 * This is a label, never a booking authorization. No missing/stale source or
 * future-day plan may be represented as a verified "Szabad" physical car.
 * The selected driver is not known on this list; same-DA claims are therefore
 * still shown as physically issued rather than available to everybody.
 */
export function vehicleDisplayStatus({date,today,vehicleStatus,booking,bookingEligible,occupancy}={}){
 const result=(text,reason)=>Object.freeze({text,reason});
 if(typeof date!=='string'||typeof today!=='string'||!date||!today)
  return result('Nem ellenőrzött','invalid_date');
 if(booking)return bookingEligible===true?
  result('Foglalt','existing_booking'):
  result('Foglalt · ellenőrizendő','booking_requires_review');
 if(vehicleStatus!=='Elérhető')return result('Nem elérhető','vehicle_out_of_service');
 if(date<today)return result('Nincs rögzített foglalás','historical_day');
 if(!occupancy||occupancy.eligible!==true){
  const reason=occupancy?.reason||'unknown_source';
  if(reason==='physical_other_driver'||reason==='attendance_other_driver')
   return result('Fizikailag kiadva','physical_issued');
  if(reason==='attendance_review')
   return result('Jelenlét ellenőrzendő','attendance_review');
  if(reason==='attendance_guard_occupied')
   return result('Attendance alapján nem foglalható','attendance_occupied_or_blocked');
  if(reason==='attendance_guard_missing_or_stale')
   return result('Nincs hiteles jelenlétadat','attendance_unverified');
  if(reason==='unconfirmed_sources')
   return result('Nem ellenőrzött','unconfirmed_sources');
  return result('Nem foglalható',reason);
 }
 if(date>today)return result('Tervezhető (jövőbeni)','future_plan_unverified');
 return result('Foglalható','verified_current_day');
}
