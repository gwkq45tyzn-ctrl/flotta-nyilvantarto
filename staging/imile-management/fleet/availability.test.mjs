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
console.log('PASS: '+count+' core fleet availability cases including real manual checkouts and incomplete sources');
