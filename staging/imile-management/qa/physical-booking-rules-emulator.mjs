// Isolated rule test. Uses ONLY 127.0.0.1:8787 demo Firestore emulator.
import fs from 'node:fs/promises';
import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import {doc,setDoc,writeBatch,serverTimestamp} from 'firebase/firestore';

const env=await initializeTestEnvironment({
 projectId:'demo-imile-fleet',
 firestore:{host:'127.0.0.1',port:8787,
  rules:await fs.readFile(new URL('../../../depokapacitas/firestore.rules',import.meta.url),'utf8')}
});
const editor=env.authenticatedContext('editor').firestore();
const viewer=env.authenticatedContext('viewer').firestore();
const now=new Date(),today=new Intl.DateTimeFormat('sv-SE',{
 timeZone:'Europe/Budapest',year:'numeric',month:'2-digit',day:'2-digit'
}).format(now);
const tomorrow=new Date(Date.parse(today+'T12:00:00Z')+86400000).toISOString().slice(0,10);
const fixtureDriver=id=>({name:'Fictional QA courier',daCode:id,vendor:'SYNTHETIC',capacity:100,active:true});
const fixtureVehicle=id=>({plate:id,model:'SYNTHETIC',status:'Elérhető'});
let passed=0,failed=0;
async function check(name,allowed,fn){
 try{await fn();if(!allowed)throw Error('Unexpectedly allowed');passed++;}
 catch(e){if(!allowed&&e.code==='permission-denied')passed++;else{failed++;console.error('FAIL '+name+': '+String(e?.message||e));}}
}
function booking(db,date,car,driver){
 const batch=writeBatch(db),id=date+'__'+car;
 batch.set(doc(db,'bookings',id),{date,vehicleId:car,driverId:driver,
  district:'IX',status:'planned',capacity:100});
 batch.set(doc(db,'driverClaims',date+'__'+driver),{date,driverId:driver,bookingId:id});
 return batch.commit();
}
function checkout(db,{date,car,driver,id}){
 const b=writeBatch(db),a={vehicleId:car,driverId:driver,active:true,mileage:0,operationId:id};
 b.set(doc(db,'fleetAssignments',car),a);
 b.set(doc(db,'fleetDriverAssignments',driver),a);
 b.set(doc(db,'fleetMovements',id),{
  vehicleId:car,driverId:driver,action:'checkout',date,mileage:0,
  note:'SYNTHETIC CHECKOUT',createdAt:serverTimestamp(),createdBy:'editor'
 });
 return b.commit();
}
try{
 await env.clearFirestore();
 await env.withSecurityRulesDisabled(async ctx=>{
  const db=ctx.firestore();
  for(const role of ['editor','viewer'])await setDoc(doc(db,'users',role),{
   name:'Fictional QA',role,active:true
  });
  for(let i=1;i<=7;i++){
   const id='QA100'+i,driver='DA100'+i;
   await setDoc(doc(db,'vehicles',id),fixtureVehicle(id));
   await setDoc(doc(db,'drivers',driver),fixtureDriver(driver));
   await setDoc(doc(db,'fleetRecords','vehicle__'+id),{
    kind:'vehicle',data:{mileage:0},revision:1,createdBy:'editor',updatedBy:'editor',
    createdAt:now,updatedAt:now
   });
  }
  for(const [car,driver,active]of [
   ['QA1001','DA1001',true],['QA1002','DA1002',true],
   ['QA1004','DA1004',true],['QA1006','DA1006',false]
  ]){
   const a={vehicleId:car,driverId:driver,active,mileage:0,operationId:'00000000000000000001'};
   await setDoc(doc(db,'fleetAssignments',car),a);
   await setDoc(doc(db,'fleetDriverAssignments',driver),a);
  }
 });
 await check('today: different courier on manually issued car denied',false,
  ()=>booking(editor,today,'QA1001','DA1003'));
 await check('today: same courier on already checked out car permitted',true,
  ()=>booking(editor,today,'QA1001','DA1001'));
 await check('today: driver checked out different car denied',false,
  ()=>booking(editor,today,'QA1003','DA1002'));
 await check('future-day plan not blocked by current Fleet checkout',true,
  ()=>booking(editor,tomorrow,'QA1004','DA1005'));
 await check('inactive manual assignment does not block a current booking',true,
  ()=>booking(editor,today,'QA1006','DA1007'));
 await check('viewer cannot create bookings even when no Fleet conflict',false,
  ()=>booking(viewer,today,'QA1007','DA1003'));
 await check('unissued car booking by editor succeeds',true,
  ()=>booking(editor,today,'QA1005','DA1005'));
 await check('same-day checkout to wrong courier after booking denied',false,
  ()=>checkout(editor,{date:today,car:'QA1005',driver:'DA1003',id:'00000000000000000025'}));
 await check('same-day checkout to booked courier permitted',true,
  ()=>checkout(editor,{date:today,car:'QA1005',driver:'DA1005',id:'00000000000000000026'}));
 console.log(JSON.stringify({suite:'depo-physical-booking-rules',passed,failed,
  emulator:'127.0.0.1:8787',data:'synthetic',date:today},null,2));
}finally{await env.cleanup();}
if(failed)process.exitCode=1;
