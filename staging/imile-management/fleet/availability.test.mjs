import assert from 'node:assert/strict';
import {fleetAvailability} from './availability.mjs';
let count=0;
const test=(name,fn)=>{try{fn();count++}catch(e){throw Error(name+': '+e.message,{cause:e})}};
const vehicles=[{id:'TESTCAR01',status:'Elérhető'},{id:'TESTCAR02',status:'Elérhető'},
 {id:'TESTCAR03',status:'Szerviz'},{id:'TESTCAR04',status:'Elérhető'}];
test('free cars excluded after manual checkout',()=>{
 const x=fleetAvailability({vehicles,assignments:[{vehicleId:'TESTCAR01',active:true}],attendanceOpenVehicleIds:[]});
 assert.equal(x.total,4);assert.equal(x.free,2);assert.equal(x.manualInUse,1);
});
test('historical return does not block availability',()=>assert.equal(
 fleetAvailability({vehicles,assignments:[{vehicleId:'TESTCAR01',active:false}],attendanceOpenVehicleIds:[]}).free,3));
test('Attendance blocks cars even without manual checkout',()=>assert.equal(
 fleetAvailability({vehicles,assignments:[],attendanceOpenVehicleIds:['TESTCAR02']}).free,2));
test('same car counted once across Attendance and manual checkout',()=>assert.equal(
 fleetAvailability({vehicles,assignments:[{vehicleId:'TESTCAR01',active:true}],attendanceOpenVehicleIds:['TESTCAR01']}).free,2));
test('manual checkout and different Attendance vehicle excluded',()=>assert.equal(
 fleetAvailability({vehicles,assignments:[{vehicleId:'TESTCAR01',active:true}],attendanceOpenVehicleIds:['TESTCAR04']}).free,1));
test('serviced and stopped vehicles never available',()=>assert.equal(
 fleetAvailability({vehicles:[{id:'TESTCAR01',status:'Szerviz'},{id:'TESTCAR02',status:'Leállított'}],
 assignments:[],attendanceOpenVehicleIds:[]}).free,0));
test('missing assignment collection cannot imply free cars',()=>assert.throws(()=>
 fleetAvailability({vehicles,attendanceOpenVehicleIds:[]}),/Hiányos/));
test('missing Attendance collection cannot imply free cars',()=>assert.throws(()=>
 fleetAvailability({vehicles,assignments:[]}),/Hiányos/));
test('broken assignment does not make up identity',()=>assert.equal(
 fleetAvailability({vehicles,assignments:[{active:true}],attendanceOpenVehicleIds:[]}).free,3));
const day='2026-11-01';
const call=(bookings,extra={})=>fleetAvailability({vehicles,assignments:[],attendanceOpenVehicleIds:[],bookings,day,...extra});
test('reserved car excluded from free count for current depot day',()=>{
 const result=call([{date:day,vehicleId:'TESTCAR01',status:'planned'}]);
 assert.equal(result.free,2);assert.equal(result.bookedToday,1);
});
test('confirmed booking also excludes reserved car',()=>assert.equal(
 call([{date:day,vehicleId:'TESTCAR02',status:'confirmed'}]).free,2));
test('future bookings never remove availability today',()=>assert.equal(
 call([{date:'2026-11-02',vehicleId:'TESTCAR01',status:'planned'}]).free,3));
test('historical bookings never remove availability today',()=>assert.equal(
 call([{date:'2026-10-31',vehicleId:'TESTCAR01',status:'confirmed'}]).free,3));
test('booking of car already manually issued not double-counted',()=>{
 const result=call([{date:day,vehicleId:'TESTCAR01',status:'confirmed'}],
  {assignments:[{vehicleId:'TESTCAR01',active:true}]});
 assert.equal(result.free,2);assert.equal(result.bookedToday,1);assert.equal(result.manualInUse,1);
});
test('same day reservation of car out for Attendance is counted once',()=>assert.equal(
 call([{date:day,vehicleId:'TESTCAR04',status:'planned'}],
 {attendanceOpenVehicleIds:['TESTCAR04']}).free,2));
test('malformed booking record still reserves the claimed car',()=>assert.equal(
 call([{date:day,vehicleId:'TESTCAR01',status:'unexpected'}]).free,2));
test('missing booking collection cannot imply free vehicles',()=>assert.throws(()=>
 fleetAvailability({vehicles,assignments:[],attendanceOpenVehicleIds:[],bookings:null,day}),/Hiányos/));
test('missing depot date blocks non-empty reservations',()=>assert.throws(()=>
 fleetAvailability({vehicles,assignments:[],attendanceOpenVehicleIds:[],bookings:[{date:day,vehicleId:'TESTCAR01'}]}),/napja/));
test('invalid depot date blocks non-empty reservations',()=>assert.throws(()=>
 fleetAvailability({vehicles,assignments:[],attendanceOpenVehicleIds:[],bookings:[{date:day,vehicleId:'TESTCAR01'}],day:'2026-02-30'}),/napja/));
console.log('PASS: '+count+' core fleet availability cases including real manual checkouts and incomplete sources');
