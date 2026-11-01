/** Fleet availability: canonical status, manual checkout, Attendance and today's planned/confirmed reservations. */
export function fleetAvailability({vehicles,assignments,attendanceOpenVehicleIds,bookings=[],day=null}={}){
 if(!Array.isArray(vehicles)||!Array.isArray(assignments)||!Array.isArray(attendanceOpenVehicleIds)||
  !Array.isArray(bookings))
  throw Error('Hiányos flottaadat: a szabad járműszám még nem ellenőrizhető.');
 if(bookings.length&&(!/^20\d{2}-\d{2}-\d{2}$/.test(day||'')||
   !Number.isFinite(Date.parse(day+'T12:00:00Z'))||
   new Date(day+'T12:00:00Z').toISOString().slice(0,10)!==day))
  throw Error('A mai foglalások napja nem ellenőrizhető.');
 const manuallyInUse=new Set(assignments.filter(x=>x&&x.active===true&&typeof x.vehicleId==='string').map(x=>x.vehicleId));
 const attendanceInUse=new Set(attendanceOpenVehicleIds.filter(x=>typeof x==='string'));
 const bookedToday=new Set(bookings.filter(x=>x&&x.date===day&&typeof x.vehicleId==='string').map(x=>x.vehicleId));
 const free=vehicles.filter(x=>x&&x.status==='Elérhető'&&typeof x.id==='string'&&
  !manuallyInUse.has(x.id)&&!attendanceInUse.has(x.id)&&!bookedToday.has(x.id)).length;
 return Object.freeze({total:vehicles.length,free,manualInUse:manuallyInUse.size,
  attendanceInUse:attendanceInUse.size,bookedToday:bookedToday.size});
}
