// This fixture is intentionally static and can only target iMile's isolated staging project.
// Never write these records into production or accept arbitrary IDs from UI inputs.
export const QA_TEST_DATE='2099-01-15';
export const QA_DRIVER_ID='SYNTHETIC_TEST';
export const QA_CAR_ID='TESTCAR01';
export const QA_BOOKING_ID=QA_TEST_DATE+'__'+QA_CAR_ID;
export const QA_CLAIM_ID=QA_TEST_DATE+'__'+QA_DRIVER_ID;
export const QA_DRIVER=Object.freeze({
  name:'Tesztfutár (mesterséges)',daCode:QA_DRIVER_ID,
  vendor:'QA',capacity:100,active:true
});
export const QA_CAR=Object.freeze({plate:QA_CAR_ID,model:'SYNTHETIC QA',status:'Elérhető'});
export const QA_BOOKING=Object.freeze({
  date:QA_TEST_DATE,vehicleId:QA_CAR_ID,driverId:QA_DRIVER_ID,
  district:'QA',status:'planned',capacity:100
});
export const QA_CLAIM=Object.freeze({
  date:QA_TEST_DATE,driverId:QA_DRIVER_ID,bookingId:QA_BOOKING_ID
});
const exact=(actual,expected)=>!!actual &&
  Object.keys(expected).every(key=>actual[key]===expected[key]) &&
  Object.keys(actual).length===Object.keys(expected).length;
export function correctQaMaster(driver,car){
  return exact(driver,QA_DRIVER)&&exact(car,QA_CAR);
}
export function correctQaBooking(booking,claim){
  return exact(booking,QA_BOOKING)&&exact(claim,QA_CLAIM);
}
export function qaCapacity(booking,driver,car){
  return correctQaMaster(driver,car) && exact(booking,QA_BOOKING) ? 100 : 0;
}
