/** Fleet availability: canonical status, actual manual checkout and Attendance usage. */
export function fleetAvailability({vehicles,assignments,attendanceOpenVehicleIds}={}){
 if(!Array.isArray(vehicles)||!Array.isArray(assignments)||!Array.isArray(attendanceOpenVehicleIds))
  throw Error('Hiányos flottaadat: a szabad járműszám még nem ellenőrizhető.');
 const manuallyInUse=new Set(assignments.filter(x=>x&&x.active===true&&typeof x.vehicleId==='string').map(x=>x.vehicleId));
 const attendanceInUse=new Set(attendanceOpenVehicleIds.filter(x=>typeof x==='string'));
 const free=vehicles.filter(x=>x&&x.status==='Elérhető'&&typeof x.id==='string'&&
  !manuallyInUse.has(x.id)&&!attendanceInUse.has(x.id)).length;
 return Object.freeze({total:vehicles.length,free,manualInUse:manuallyInUse.size,
  attendanceInUse:attendanceInUse.size});
}
