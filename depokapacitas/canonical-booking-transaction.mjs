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
    keyedDriver:sdk.doc(db,'flottaDrivers',driverId),
    keyedVehicle:sdk.doc(db,'flottaVehicles',vehicleId),
    fleet:sdk.doc(db,'flottaSharedState','current'),
    approval:sdk.doc(db,'flottaMigrationApproval','current')
  };
  // The function may RETRY on concurrent change, so DO NOT mutate UI or
  // localStorage inside it. No success signal until runTransaction resolves.
  const confirmation=await sdk.runTransaction(db,async tx=>{
    if(getCurrentUid()!==uid)throw Error('BOOKING_BLOCKED: session_changed');
    const [oldBook,oldClaim,fleet,approval,
      keyedDriver,keyedVehicle]=await Promise.all([
      tx.get(refs.booking),tx.get(refs.driverClaim),
      tx.get(refs.fleet),tx.get(refs.approval),
      // Canonical identity masters must be SEEDED before booking.
      // Never create/overwrite them in a booking transaction.
      tx.get(refs.keyedDriver),tx.get(refs.keyedVehicle)
    ]);
    // The vehicle slot is the booking document. A driverClaims row whose
    // booking document is already gone is not occupancy: it has no cancel
    // button and would otherwise block that driver for the whole day.
    if(oldBook.exists())
      throw Error('BOOKING_BLOCKED: already_occupied');
    let staleClaim=false;
    if(oldClaim.exists()){
      const claim=oldClaim.data()||{};
      const samePair=claim.bookingId===bookingId&&claim.date===date&&
        claim.driverId===driverId;
      if(claim.bookingId===bookingId){
        if(!samePair)throw Error('BOOKING_BLOCKED: already_occupied');
      }else{
        if(typeof claim.bookingId!=='string'||claim.bookingId.length<1||
           claim.bookingId.length>120)
          throw Error('BOOKING_BLOCKED: already_occupied');
        const other=await tx.get(sdk.doc(db,'bookings',claim.bookingId));
        if(other.exists())throw Error('BOOKING_BLOCKED: already_occupied');
        staleClaim=true;
      }
    }
    const check=assessCanonicalBookingMaster({
      fleet:fleet.exists()?fleet.data():null,
      approval:approval.exists()?approval.data():null,
      uid:getCurrentUid()===uid?uid:null,
      driverId,vehicleId,
      keyedDriver:keyedDriver.exists()?keyedDriver.data():null,
      keyedVehicle:keyedVehicle.exists()?keyedVehicle.data():null
    });
    if(!check.ready)throw Error('BOOKING_BLOCKED: '+check.code);
    const fleetData=fleet.exists()?fleet.data():{};
    // Trusted import must finish before ANY booking. Only an authorized
    // privileged migration sets this immutable server-side seal; a browser
    // must not bootstrap or infer approval from keyed records or local cache.
    if(fleetData.sealed!==true)
      throw Error('BOOKING_BLOCKED: fleet_migration_not_sealed');
    // After cutover, the CURRENT keyed master is the capacity authority.
    // The legacy Fleet array is immutable after seal, so its capacity can
    // naturally differ after an authorized keyed driver edit.
    const rawCapacity=keyedDriver.exists()?keyedDriver.data().kapacitas:null;
    if(!Number.isSafeInteger(rawCapacity)||rawCapacity<0||rawCapacity>10000)
      throw Error('BOOKING_BLOCKED: invalid_capacity');
    if(getCurrentUid()!==uid)throw Error('BOOKING_BLOCKED: session_changed');
    // DA business IDs and license plates have DIFFERENT normalization rules.
    // DA codes may contain '_' or '-': only trim and uppercase ASCII letters.
    // Removing '-' here falsely denies legitimate DA-0002 even though the
    // canonical Fleet projection and Firestore Rules permit it.
    const normDriver=s=>typeof s==='string' && /^[A-Za-z0-9_-]+$/.test(s.trim())
      ?s.trim().toUpperCase():'';
    const normVehicle=s=>typeof s==='string' && /^[A-Za-z0-9 -]+$/.test(s)
      ?s.replace(/[ -]/g,'').toUpperCase():'';
    const driverMatches=(fleetData.drivers||[]).filter(d=>normDriver(d.daCode)===driverId);
    const vehicleMatches=(fleetData.vehicles||[]).filter(v=>normVehicle(v.rendszam)===vehicleId);
    if(driverMatches.length!==1)throw Error('BOOKING_BLOCKED: duplicate_or_missing_driver');
    if(vehicleMatches.length!==1)throw Error('BOOKING_BLOCKED: duplicate_or_missing_vehicle');
    const driverIndex=(fleetData.drivers||[]).findIndex(d=>normDriver(d.daCode)===driverId);
    const vehicleIndex=(fleetData.vehicles||[]).findIndex(v=>normVehicle(v.rendszam)===vehicleId);
    if(driverIndex<0||vehicleIndex<0)throw Error('BOOKING_BLOCKED: master_index_not_found');
    const kd=keyedDriver.data(),kv=keyedVehicle.data();
    // P0 verified source-index proof is a PRIVILEGED, immutable field of
    // the canonical keyed document itself. A separate browser-writable
    // flottaDriverClaims/flottaVehicleClaims document cannot authorize an
    // alternate duplicate row in the archived source.
    if(!Number.isSafeInteger(kd.sourceIndex)||
       !Number.isSafeInteger(kv.sourceIndex)||
       kd.sourceIndex!==driverIndex||kv.sourceIndex!==vehicleIndex||
       normDriver(kd.daCode)!==driverId||
       normVehicle(kv.rendszam)!==vehicleId)
      throw Error('BOOKING_BLOCKED: keyed_master_drift');
    tx.set(refs.booking,{date,driverId,vehicleId,district,status,capacity:rawCapacity,driverIndex,vehicleIndex});
    // A claim that already names this booking must stay untouched: Rules
    // reject a no-op claim update. A claim naming a missing other booking
    // is retargeted onto this booking; Rules allow that only while the
    // previous booking document is already gone.
    if(!oldClaim.exists()||staleClaim)
      tx.set(refs.driverClaim,{date,driverId,bookingId});
    // Read-only identity-index proofs were verified above and by Rules.
    // Only write booking + date-scoped reverse claim, atomically.
    return {bookingId,driverKey,fleetRevision:check.fleetRevision};
  });
  // Firestore SDK resolves the transaction only after atomic server success.
  // Returning this does NOT imply the wider Fleet+Depot migration has GO.
  return {committed:true,...confirmation};
}
