/**
 * REAL Firestore transaction adapter for a single Depot booking.
 *
 * Receives the Firebase SDK's {doc,runTransaction} from the authenticated app.
 * Node unit tests inject the same real SDK bound to the LOCAL emulator.
 * NO Firebase config, deploy, UID, credentials or network access in module.
 *
 * IMPORTANT: Transactions are atomic only for the documents THEY touch.
 * This checks the selected driver/vehicle, but does not solve all V1 Fleet
 * <-> Depot canonical master synchronization. Overall release is NO-GO.
 */
import {assessCanonicalBookingMaster} from './canonical-booking-gate.mjs';

const idPattern=/^[A-Z0-9_-]{4,40}$/;
const platePattern=/^[A-Z0-9]{4,12}$/;
const datePattern=/^\d{4}-\d{2}-\d{2}$/;

export async function commitCanonicalDepotBooking({
  db,sdk,uid,getCurrentUid,offline,booking
}={}){
  if(offline!==false)throw Error('BOOKING_BLOCKED: offline_or_unverified_network');
  if(!uid||typeof getCurrentUid!=='function'||getCurrentUid()!==uid)
    throw Error('BOOKING_BLOCKED: session_changed');
  if(!sdk||typeof sdk.doc!=='function'||typeof sdk.runTransaction!=='function')
    throw Error('BOOKING_BLOCKED: invalid_firestore_sdk');
  if(!booking||!datePattern.test(booking.date||'')||
     !idPattern.test(booking.driverId||'')||
     !platePattern.test(booking.vehicleId||'')||
     !['planned','confirmed'].includes(booking.status)||
     typeof booking.district!=='string'||booking.district.length>60)
    throw Error('BOOKING_BLOCKED: invalid_booking_fields');
  const {date,driverId,vehicleId,district,status}=booking;
  const bookingId=date+'__'+vehicleId,driverKey=date+'__'+driverId;
  const refs={
    booking:sdk.doc(db,'bookings',bookingId),
    driverClaim:sdk.doc(db,'driverClaims',driverKey),
    driver:sdk.doc(db,'drivers',driverId),
    vehicle:sdk.doc(db,'vehicles',vehicleId),
    capacity:sdk.doc(db,'driverCapacities',driverId),
    fleet:sdk.doc(db,'flottaSharedState','current'),
    approval:sdk.doc(db,'flottaMigrationApproval','current')
  };
  // The function may RETRY on concurrent change, so DO NOT mutate UI or
  // localStorage inside it. No success signal until runTransaction resolves.
  const confirmation=await sdk.runTransaction(db,async tx=>{
    if(getCurrentUid()!==uid)throw Error('BOOKING_BLOCKED: session_changed');
    const [oldBook,oldClaim,driver,vehicle,capacity,fleet,approval]=await Promise.all([
      tx.get(refs.booking),tx.get(refs.driverClaim),
      tx.get(refs.driver),tx.get(refs.vehicle),tx.get(refs.capacity),
      tx.get(refs.fleet),tx.get(refs.approval)
    ]);
    if(oldBook.exists()||oldClaim.exists())
      throw Error('BOOKING_BLOCKED: already_occupied');
    const check=assessCanonicalBookingMaster({
      fleet:fleet.exists()?fleet.data():null,
      approval:approval.exists()?approval.data():null,
      uid:getCurrentUid()===uid?uid:null,
      driverId,vehicleId,
      depotDriver:driver.exists()?{id:driverId,...driver.data()}:null,
      depotVehicle:vehicle.exists()?{id:vehicleId,...vehicle.data()}:null
    });
    if(!check.ready)throw Error('BOOKING_BLOCKED: '+check.code);
    const rawCapacity=capacity.exists()?capacity.data()?.capacity:driver.data()?.capacity;
    if(!Number.isSafeInteger(rawCapacity)||rawCapacity<0||rawCapacity>10000)
      throw Error('BOOKING_BLOCKED: invalid_capacity');
    if(getCurrentUid()!==uid)throw Error('BOOKING_BLOCKED: session_changed');
    const fleetData=fleet.exists()?fleet.data():{};
    const driverIndex=(fleetData.drivers||[]).findIndex(d=>String(d.daCode||'').toUpperCase()===driverId);
    const vehicleIndex=(fleetData.vehicles||[]).findIndex(v=>String(v.rendszam||'').replace(/[\s-]/g,'').toUpperCase()===vehicleId);
    if(driverIndex<0||vehicleIndex<0)throw Error('BOOKING_BLOCKED: master_index_not_found');
    tx.set(refs.booking,{date,driverId,vehicleId,district,status,capacity:rawCapacity,driverIndex,vehicleIndex});
    tx.set(refs.driverClaim,{date,driverId,bookingId});
    return {bookingId,driverKey,fleetRevision:check.fleetRevision};
  });
  // Firestore SDK resolves the transaction only after atomic server success.
  // Returning this does NOT imply the wider Fleet+Depot migration has GO.
  return {committed:true,...confirmation};
}
