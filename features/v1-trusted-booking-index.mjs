/**
 * Offline-only derivation of the frozen booking identity indexes.
 * MUST be run by the separately approved privileged import process against
 * the same *complete original* Fleet snapshot as its immutable source SHA.
 * Never let a browser produce or replace authoritative approval fields.
 */
import {planSharedMigration} from './shared-master-adapter.mjs';

export function deriveTrustedBookingIndexes(source){
  const plan=planSharedMigration(source);
  if(!plan.ready)throw Error('IDENTITY_IMPORT_BLOCKED: '+JSON.stringify(plan.issues));
  const bookingDriverIndexes=Object.create(null);
  const bookingVehicleIndexes=Object.create(null);
  const drivers=source.drivers||[],vehicles=source.vehicles||[];
  for(let i=0;i<drivers.length;i++){
    const item=plan.drivers[i];
    if(!item||Object.hasOwn(bookingDriverIndexes,item.id))throw Error('IDENTITY_IMPORT_BLOCKED: duplicate_DA');
    bookingDriverIndexes[item.id]=i;
  }
  for(let i=0;i<vehicles.length;i++){
    const item=plan.vehicles[i];
    if(!item||Object.hasOwn(bookingVehicleIndexes,item.id))throw Error('IDENTITY_IMPORT_BLOCKED: duplicate_plate');
    bookingVehicleIndexes[item.id]=i;
  }
  return {bookingDriverIndexes:{...bookingDriverIndexes},bookingVehicleIndexes:{...bookingVehicleIndexes}};
}
