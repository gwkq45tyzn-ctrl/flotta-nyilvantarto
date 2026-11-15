/**
 * Release one Depot booking and its date-scoped driver claim.
 * A missing claim must not block the booking delete: the current cancel
 * path always deletes the claim document, and Rules reject that delete
 * when the document is already gone, so the booking stays occupied.
 * A claim that points at a different booking is left untouched.
 */
export async function releaseCanonicalDepotBooking({
  db,sdk,offline,bookingId
}={}){
  if(offline!==false)throw Error('BOOKING_BLOCKED: offline_or_unverified_network');
  if(!sdk||typeof sdk.doc!=='function'||typeof sdk.runTransaction!=='function')
    throw Error('BOOKING_BLOCKED: invalid_firestore_sdk');
  if(typeof bookingId!=='string'||bookingId.length<1||bookingId.length>120)
    throw Error('BOOKING_BLOCKED: invalid_booking_fields');
  await sdk.runTransaction(db,async tx=>{
    const bookingRef=sdk.doc(db,'bookings',bookingId);
    const booking=await tx.get(bookingRef);
    if(!booking.exists())throw Error('A foglalás már nem található.');
    const data=booking.data()||{};
    if(typeof data.date!=='string'||typeof data.driverId!=='string'||
       !data.date||!data.driverId)
      throw Error('BOOKING_BLOCKED: invalid_booking_fields');
    const claimRef=sdk.doc(db,'driverClaims',data.date+'__'+data.driverId);
    const claim=await tx.get(claimRef);
    if(claim.exists()){
      if(claim.data()?.bookingId!==bookingId)
        throw Error('BOOKING_BLOCKED: claim_belongs_to_other_booking');
      tx.delete(claimRef);
    }
    tx.delete(bookingRef);
  });
  return {released:true,bookingId};
}
