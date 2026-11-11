/**
 * Read-only live planning projection. Keep the recorded original booking
 * snapshot untouched but count CURRENT verified keyed Fleet driver capacity
 * for today and future. Missing/invalid source or corrupt bookings are NOT 0.
 */
export function projectLiveBookingCapacity(bookings,drivers,today) {
  if(!Array.isArray(bookings)||!Array.isArray(drivers)||
     typeof today!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(today))
    throw Error('UNVERIFIED_CAPACITY_SOURCE');
  const byId=new Map();
  for(const d of drivers){
    if(!d||typeof d.id!=='string'||byId.has(d.id)||
       !Number.isSafeInteger(d.capacity)||d.capacity<0||d.capacity>10000)
      throw Error('INVALID_LIVE_DRIVER_CAPACITY');
    byId.set(d.id,d);
  }
  return bookings.map(b=>{
    if(!b||typeof b.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(b.date))
      return {...b,capacity:-1};
    if(b.date<today)return {...b}; // immutable historical report value
    const current=byId.get(b.driverId);
    // Never use an invalid recorded booking or invent missing current capacity.
    if(!current||!Number.isSafeInteger(b.capacity)||b.capacity<0||b.capacity>10000)
      return {...b,capacity:-1};
    return {...b,capacity:current.capacity};
  });
}
