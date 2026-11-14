/**
 * Staging-only pure functions for operational capacity.
 * Keep historical snapshots intact, but never count currently unavailable
 * vehicles or inactive couriers in today's or future planned capacity.
 */
export function assessBooking(booking, drivers, vehicles, today) {
  if (booking.date < today) return {eligible:true,reason:'historical'};
  const driver = drivers.find(x => x.id === booking.driverId);
  if (!driver) return {eligible:false,reason:'driver_missing'};
  if (driver.active !== true) return {eligible:false,reason:'driver_inactive'};
  const vehicle = vehicles.find(x => x.id === booking.vehicleId);
  if (!vehicle) return {eligible:false,reason:'vehicle_missing'};
  if (vehicle.status !== 'Elérhető') return {eligible:false,reason:'vehicle_unavailable'};
  return {eligible:true,reason:'available'};
}
export function effectiveCapacity(booking, drivers, vehicles, today) {
  if(!assessBooking(booking,drivers,vehicles,today).eligible)return 0;
  // Explicit 0 is a real capacity. Missing, blank and negative values are
  // not an authorized zero and must not be planned.
  if(!Number.isSafeInteger(booking.capacity)||booking.capacity<0||booking.capacity>10000)
    return null;
  return booking.capacity;
}
export function eligibleDriver(driver) {
  return driver?.active === true;
}
export function eligibleVehicle(vehicle) {
  return vehicle?.status === 'Elérhető';
}
