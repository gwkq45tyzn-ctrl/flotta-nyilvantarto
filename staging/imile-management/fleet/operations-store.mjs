import {normalizeFleetRecord,validDate} from './operations-data.mjs';
const check=(ok,message)=>{if(!ok)throw Error(message);};
export async function saveFleetRecord({db,kind,input,baseline,uid,doc,runTransaction,serverTimestamp}){
 check(db?.app?.options?.projectId==='imile-management-staging','Csak staging mentés engedélyezett.');
 const record=normalizeFleetRecord(kind,input),ref=doc(db,'fleetRecords',record.id);
 check(!baseline||baseline.id===record.id,'A rekordazonosító nem módosítható.');
 await runTransaction(db,async tx=>{
  const current=await tx.get(ref);
  check(baseline?current.exists()&&current.data().revision===baseline.revision:!current.exists(),
   'A rekord már létezik vagy időközben megváltozott. Frissítsd a listát.');
  for(const [field,col]of [['vehicleId','vehicles'],['driverId','drivers']]){
   if(record.data[field])check((await tx.get(doc(db,col,record.data[field]))).exists(),'Hiányzó közös törzsrekord: '+record.data[field]);
  }
  let vehicle=null;
  if(kind==='service')vehicle=await tx.get(doc(db,'vehicles',record.data.vehicleId));
  tx.set(ref,{kind,data:record.data,revision:(baseline?.revision||0)+1,
   createdAt:current.exists()?current.data().createdAt:serverTimestamp(),
   createdBy:current.exists()?current.data().createdBy:uid,updatedAt:serverTimestamp(),updatedBy:uid});
  if(vehicle)tx.update(doc(db,'vehicles',record.data.vehicleId),{status:record.data.status});
 });
 return record.id;
}
export async function moveFleetVehicle({db,input,uid,doc,collection,runTransaction,serverTimestamp}){
 check(db?.app?.options?.projectId==='imile-management-staging','Csak staging művelet engedélyezett.');
 const vehicleId=String(input.vehicleId||'').toUpperCase().replace(/[\s-]/g,''),driverId=String(input.driverId||'').trim().toUpperCase();
 const action=input.action,date=input.date,mileage=Number(input.mileage),note=String(input.note||'').trim();
 check(/^[A-Z0-9]{4,12}$/.test(vehicleId)&&/^[A-Z0-9_-]{4,40}$/.test(driverId),'Érvénytelen rendszám vagy DA-kód.');
 check(['checkout','return'].includes(action)&&validDate(date),'Érvénytelen művelet vagy dátum.');
 check(/^\d+$/.test(String(input.mileage))&&Number.isSafeInteger(mileage)&&mileage>=0&&mileage<=100000000&&note.length<=2000,'Érvénytelen km-óra vagy megjegyzés.');
 const event=doc(collection(db,'fleetMovements')),vRef=doc(db,'fleetAssignments',vehicleId),dRef=doc(db,'fleetDriverAssignments',driverId);
 await runTransaction(db,async tx=>{
  const [v,d,vehicle,driver]=await Promise.all([tx.get(vRef),tx.get(dRef),tx.get(doc(db,'vehicles',vehicleId)),tx.get(doc(db,'drivers',driverId))]);
  check(vehicle.exists()&&driver.exists(),'Hiányzó közös jármű vagy futár.');
  if(action==='checkout'){
   check(vehicle.data().status==='Elérhető'&&driver.data().active===true,'Inaktív futárnak vagy nem elérhető autóval nem készülhet kiadás.');
   check(!v.data()?.active&&!d.data()?.active,'Az autó vagy a futár már aktív kiadáshoz tartozik.');
  }else check(v.exists()&&d.exists()&&v.data().active&&d.data().active&&v.data().driverId===driverId&&d.data().vehicleId===vehicleId,'Nincs egyező aktív kiadás.');
  check(!v.exists()||mileage>=v.data().mileage,'A km-óra nem csökkenhet.');
  const assignment={vehicleId,driverId,active:action==='checkout',mileage,operationId:event.id};
  tx.set(vRef,assignment);tx.set(dRef,assignment);
  tx.set(event,{vehicleId,driverId,action,date,mileage,note,createdAt:serverTimestamp(),createdBy:uid});
 });
 return event.id;
}
