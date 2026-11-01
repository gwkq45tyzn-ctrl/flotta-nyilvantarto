// LOCAL EMULATOR ONLY. No Firebase credentials, live project or real people.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import {doc,setDoc,deleteDoc,writeBatch,Timestamp,serverTimestamp} from 'firebase/firestore';
import {initialVehicleDetails} from './operations-data.mjs';
import {depotDay} from '../../../depokapacitas/booking-occupancy.mjs';
let rules=await fs.readFile(new URL('../../../depokapacitas/firestore.rules',import.meta.url),'utf8');
// Tests the production date helper with historical clock values, without overriding request.time.
rules=rules.replace('match /{path=**}',"match /__qa_day/{id} { allow create: if budapestDayAt(request.resource.data.at) == request.resource.data.expected; }\n    match /{path=**}");
const env=await initializeTestEnvironment({projectId:'demo-imile-occupancy',firestore:{host:'127.0.0.1',port:8787,rules}});
let passed=0;const test=async(name,allowed,fn)=>{console.log("RUN "+name);await (allowed?assertSucceeds(fn()):assertFails(fn()));passed++;};
const today=depotDay(Date.now()),tomorrow=depotDay(Date.now()+86400000),plate='QATEST01',driver='QADRIVER1';
const contexts={};for(const role of ['admin','editor','viewer','inactive','unknown'])contexts[role]=env.authenticatedContext(role).firestore();contexts.anonymous=env.unauthenticatedContext().firestore();
const seed=async({manual,guard}={})=>{await env.clearFirestore();await env.withSecurityRulesDisabled(async c=>{const db=c.firestore();for(const role of Object.keys(contexts).filter(x=>x!=='anonymous'))await setDoc(doc(db,'users',role),{name:'Synthetic',role:role==='unknown'?'unexpected':role==='inactive'?'editor':role,active:role!=='inactive'});await setDoc(doc(db,'vehicles',plate),{plate,model:'Synthetic',status:'Elérhető'});await setDoc(doc(db,'drivers',driver),{name:'Synthetic',daCode:driver,vendor:'QA',active:true,capacity:100});await setDoc(doc(db,'driverCapacities',driver),{capacity:100});if(manual)await setDoc(doc(db,'fleetAssignments',plate),manual);if(guard)await setDoc(doc(db,'attendanceVehicleGuards',today+'__'+plate),guard);});};
const clearance=()=>({date:today,vehicleId:plate,source:'trusted-attendance-projection-v1',state:'clear',driverId:'',confirmedAt:Timestamp.now()});
const book=(role,date=today)=>{const db=contexts[role],b=writeBatch(db),bookingId=date+'__'+plate;b.set(doc(db,'bookings',bookingId),{date,vehicleId:plate,driverId:driver,district:'SYNTHETIC',status:'planned',capacity:100});b.set(doc(db,'driverClaims',date+'__'+driver),{date,driverId:driver,bookingId});return b.commit();};
const checkout=async(driverId='QADRIVER2')=>{const db=contexts.editor;await env.withSecurityRulesDisabled(c=>setDoc(doc(c.firestore(),'drivers',driverId),{name:'Synthetic 2',daCode:driverId,vendor:'QA',active:true,capacity:100}));const b=writeBatch(db),operationId='SYNTHETICOPERATION01';assert.equal(operationId.length,20);const pair={vehicleId:plate,driverId:driverId,active:true,mileage:100,operationId};b.set(doc(db,'fleetAssignments',plate),pair);b.set(doc(db,'fleetDriverAssignments',driverId),pair);b.set(doc(db,'fleetMovements',operationId),{vehicleId:plate,driverId:driverId,action:'checkout',date:today,mileage:100,note:'Synthetic',createdAt:serverTimestamp(),createdBy:'editor'});b.set(doc(db,'fleetRecords','vehicle__'+plate),{kind:'vehicle',data:initialVehicleDetails(plate,100),revision:1,createdAt:serverTimestamp(),updatedAt:serverTimestamp(),createdBy:'editor',updatedBy:'editor'});return b.commit();};
try{
 for(const role of Object.keys(contexts)){await seed({guard:clearance()});await test(role+' clearance booking',['admin','editor'].includes(role),()=>book(role));}
 await seed();await test('missing trusted projection',false,()=>book('editor'));
 await seed({guard:{...clearance(),confirmedAt:Timestamp.fromMillis(Date.now()-121000)}});await test('expired trusted projection',false,()=>book('editor'));
 await seed({guard:{...clearance(),confirmedAt:Timestamp.fromMillis(Date.now()+60000)}});await test('future trusted projection',false,()=>book('editor'));
 await seed({guard:{...clearance(),state:'assigned',driverId:'QADRIVER2'}});await test('Attendance other DA',false,()=>book('editor'));
 await seed({guard:{...clearance(),state:'assigned',driverId:driver}});await test('Attendance same DA',true,()=>book('editor'));
 await seed({guard:clearance(),manual:{vehicleId:plate,driverId:'QADRIVER2',active:true}});await test('physical other DA',false,()=>book('editor'));
 await seed({guard:clearance(),manual:{vehicleId:plate,driverId:driver,active:true}});await test('physical same DA',true,()=>book('editor'));
 await seed({manual:{vehicleId:plate,driverId:'QADRIVER2',active:true}});await test('tomorrow unblocked',true,()=>book('editor',tomorrow));
 await seed({guard:clearance()});await env.withSecurityRulesDisabled(c=>deleteDoc(doc(c.firestore(),'driverCapacities',driver)));await test('missing capacity document falls back to canonical driver',true,()=>book('editor'));
 await seed({guard:clearance()});await env.withSecurityRulesDisabled(c=>setDoc(doc(c.firestore(),'fleetDriverAssignments',driver),{driverId:driver,vehicleId:'QACAROTHER',active:true}));await test('driver already physically has another car',false,()=>book('editor'));
 await seed({guard:clearance(),manual:{vehicleId:plate,driverId:driver,active:true}});await env.withSecurityRulesDisabled(c=>setDoc(doc(c.firestore(),'fleetDriverAssignments',driver),{driverId:driver,vehicleId:plate,active:true}));await test('all claims and declared capacity present within access budget',true,()=>book('editor'));
 await seed();await test('browser cannot forge guard in booking batch',false,()=>{const db=contexts.admin,b=writeBatch(db);b.set(doc(db,'attendanceVehicleGuards',today+'__'+plate),clearance());return b.commit();});
 await seed({guard:clearance()});await test('guard deletion denied',false,()=>deleteDoc(doc(contexts.admin,'attendanceVehicleGuards',today+'__'+plate)));
 const vehicleEvent={eventDate:today,eventTime:today+'T08:00:00',daCode:driver,vehicleId:plate,timeKnown:true,type:'Log In',driverName:'Synthetic',vendor:'QA',status:'',photoFront:'',photoLeft:'',photoRight:'',photoBack:'',source:'synthetic-emulator'};
 await test('browser cannot inject vehicle Attendance',false,()=>setDoc(doc(contexts.editor,'attendance','INJECT'),vehicleEvent));
 await env.withSecurityRulesDisabled(c=>setDoc(doc(c.firestore(),'attendance','OWNED_BY_PUBLISHER'),vehicleEvent));
 const {vehicleId:omittedVehicle,...withoutVehicle}=vehicleEvent;await test('browser cannot strip vehicle from existing Attendance',false,()=>setDoc(doc(contexts.editor,'attendance','OWNED_BY_PUBLISHER'),withoutVehicle));
 await test('browser cannot delete vehicle Attendance',false,()=>deleteDoc(doc(contexts.admin,'attendance','OWNED_BY_PUBLISHER')));
 await env.withSecurityRulesDisabled(c=>setDoc(doc(c.firestore(),'attendanceVehicleGuards',today+'__'+plate),{...clearance(),state:'assigned',driverId:'QADRIVER2'}));await test('late authoritative update rejects old booking clearance',false,()=>book('editor'));
 await seed({guard:clearance()});await book('editor');await test('checkout after other-driver booking denied',false,()=>checkout());
 await seed({guard:clearance()});await test('checkout without reservation still allowed',true,()=>checkout());
 await seed({guard:clearance()});await book('editor');await test('same-DA checkout after booking allowed',true,()=>checkout(driver));
 await seed({guard:clearance()});const parallel=await Promise.allSettled([book('editor'),checkout()]);assert.equal(parallel.filter(x=>x.status==='fulfilled').length,1,'Only one conflicting physical/reservation operation may commit');passed++;
 for(const utc of ['2026-01-01T22:59:59Z','2026-01-01T23:00:00Z','2026-06-01T21:59:59Z','2026-06-01T22:00:00Z','2026-03-29T00:59:59Z','2026-03-29T01:00:00Z','2026-03-29T21:59:59Z','2026-03-29T22:00:00Z','2026-10-25T00:59:59Z','2026-10-25T01:00:00Z','2026-10-25T22:59:59Z','2026-10-25T23:00:00Z']){const day=depotDay(Date.parse(utc));await test('Budapest '+utc,true,()=>setDoc(doc(contexts.editor,'__qa_day',String(passed)),{at:Timestamp.fromDate(new Date(utc)),expected:Timestamp.fromDate(new Date(day+'T00:00:00Z'))}));}
 console.log(`PASS: ${passed} compiled same-day booking permissions and Budapest boundary cases`);
}finally{await env.cleanup();}

