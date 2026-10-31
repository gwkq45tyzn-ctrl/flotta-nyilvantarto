/**
 * Safe, pure adaptation of a read-only vehicle/day/driver planning sheet.
 * The source tab is not connected yet. Never infer an ambiguous driver
 * identity or silently override an operator-maintained booking.
 */
const canonicalName = v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('hu-HU').replace(/\s+/g,' ').trim();
const canonicalPlate = v=>String(v??'').toUpperCase().replace(/[\s-]+/g,'').trim();
const canonicalDa = v=>String(v??'').trim().toUpperCase();
const validDay=v=>{
 const m=/^(20\d\d)-(\d\d)-(\d\d)$/.exec(String(v??''));
 if(!m)return false;
 const d=new Date(v+'T12:00:00Z');
 return !Number.isNaN(d.valueOf())&&d.toISOString().slice(0,10)===v;
};
export function parseRosterDay(value,year){
 if(value instanceof Date&&!Number.isNaN(value.valueOf()))return value.toISOString().slice(0,10);
 const s=String(value??'').trim().replace(/\.$/,'');
 if(validDay(s))return s;
 // Hungarian dd.mm.yyyy and yyyy.mm.dd; never guess a year for a floating weekday.
 const a=/^(20\d\d)[.\/-](\d{1,2})[.\/-](\d{1,2})$/.exec(s);
 const b=/^(\d{1,2})[.\/-](\d{1,2})[.\/-](20\d\d)$/.exec(s);
 const c=/^(\d{1,2})[.](\d{1,2})$/.exec(s);
 let result='';
 if(a)result=[a[1],a[2].padStart(2,'0'),a[3].padStart(2,'0')].join('-');
 else if(b)result=[b[3],b[2].padStart(2,'0'),b[1].padStart(2,'0')].join('-');
 else if(c&&Number.isInteger(year)&&year>=2000&&year<=2199)result=[year,String(c[2]).padStart(2,'0'),String(c[1]).padStart(2,'0')].join('-');
 return validDay(result)?result:'';
}
const header=v=>canonicalName(v).replace(/[^a-z0-9]/g,'');
const isPlate=v=>/^[A-Z0-9]{4,12}$/.test(canonicalPlate(v));
const col=(values,options)=>values.findIndex(v=>options.includes(header(v)));
const dateLabels=['date','datum','nap','workdate'];
const vehicleLabels=['vehicle','vehicleid','vehicleplate','plate','rendszam','autorendszam','auto'];
const driverLabels=['driver','drivername','futar','futarneve','futarnev','name','sofor','soforneve'];
const daLabels=['dacode','drivercode','futarkod'];
const empty=v=>v===null||v===undefined||String(v).trim()==='';
export function parseVehicleFuelMatrix(rows,{year,source='VEHICLE_Fuel_Database'}={}){
 if(!Array.isArray(rows)||!rows.length)return {format:'unknown',records:[],issues:[{reason:'empty_sheet'}]};
 const records=[],issues=[];
 const headerIndex=rows.findIndex((row,i)=>i<12&&Array.isArray(row)&&(col(row,vehicleLabels)>=0||col(row,dateLabels)>=0));
 if(headerIndex<0)return {format:'unknown',records,issues:[{reason:'header_not_found'}]};
 const h=rows[headerIndex].map(v=>String(v??'').trim());
 const vehicleCol=col(h,vehicleLabels),dateCol=col(h,dateLabels),driverCol=col(h,driverLabels),daCol=col(h,daLabels);
 const parsedDates=h.map(v=>parseRosterDay(v,year));
 const isWideVehicle=vehicleCol>=0&&parsedDates.filter(Boolean).length>0;
 const isWideDate=dateCol>=0&&h.some(x=>isPlate(x))&&driverCol<0;
 const isLong=dateCol>=0&&vehicleCol>=0&&(driverCol>=0||daCol>=0);
 const format=isLong?'long':isWideVehicle?'vehicle_rows':isWideDate?'date_rows':'unknown';
 if(format==='unknown')return {format,records,issues:[{reason:'unsupported_layout'}]};
 function append(date,plate,name,da,sourceRow,sourceColumn){
   if(empty(name)&&empty(da))return;
   const vehicleId=canonicalPlate(plate);
   if(!validDay(date)||!isPlate(vehicleId)){issues.push({reason:'invalid_day_or_vehicle',row:sourceRow,column:sourceColumn});return;}
   const driverName=String(name??'').trim();
   const driverId=canonicalDa(da);
   if(!driverId&&!driverName){issues.push({reason:'driver_missing',row:sourceRow,column:sourceColumn});return;}
   records.push({id:date+'__'+vehicleId,date,vehicleId,driverId,driverName,
      source,sourceRow,sourceColumn});
 }
 for(let i=headerIndex+1;i<rows.length;i++){
   const row=rows[i];
   if(!Array.isArray(row))continue;
   const n=i+1;
   if(format==='long'){
     const date=parseRosterDay(row[dateCol],year);
     append(date,row[vehicleCol],driverCol<0?'':row[driverCol],daCol<0?'':row[daCol],n,vehicleCol+1);
   }else if(format==='vehicle_rows'){
     if(!isPlate(row[vehicleCol]))continue;
     for(let j=0;j<parsedDates.length;j++)if(parsedDates[j]){
       append(parsedDates[j],row[vehicleCol],row[j],'',n,j+1);
     }
   }else{
     const date=parseRosterDay(row[dateCol],year);
     for(let j=0;j<h.length;j++)if(j!==dateCol&&isPlate(h[j]))append(date,h[j],row[j],'',n,j+1);
   }
 }
 return {format,records,issues};
}
export function reconcileDailyRoster({date,sourceRows=[],manualBookings=[],drivers=[],vehicles=[]}={}){
 if(!validDay(date))throw Error('Érvénytelen munkanap');
 const driverLookup=new Map();
 for(const d of drivers){
   const da=canonicalDa(d.daCode||d.id),name=canonicalName(d.name);
   if(da){const k='da:'+da;driverLookup.set(k,[...(driverLookup.get(k)||[]),d]);}
   if(name){const k='name:'+name;driverLookup.set(k,[...(driverLookup.get(k)||[]),d]);}
 }
 const knownCars=new Map(vehicles.map(v=>[canonicalPlate(v.plate||v.id),v]));
 const claims=sourceRows.filter(x=>x.date===date).map(row=>{
   const vehicleId=canonicalPlate(row.vehicleId||row.plate);
   const lookupKey=row.driverId?'da:'+canonicalDa(row.driverId):'name:'+canonicalName(row.driverName);
   const driversFound=driverLookup.get(lookupKey)||[];
   const exactDriver=driversFound.length===1?driversFound[0]:null;
   const driverId=exactDriver?canonicalDa(exactDriver.daCode||exactDriver.id):'';
   const car=knownCars.get(vehicleId);
   const reason=driversFound.length!==1?'driver_not_unique':!car?'vehicle_unknown':
     exactDriver.active!==true?'driver_inactive':car.status!=='Elérhető'?'vehicle_unavailable':'';
   return {date,vehicleId,driverId,driverName:row.driverName||exactDriver?.name||'',
      source:row.source||'VEHICLE_Fuel_Database',sourceRow:row.sourceRow??null,reason};
 });
 const carCounts=new Map(),driverCounts=new Map();
 for(const row of claims){
   carCounts.set(row.vehicleId,(carCounts.get(row.vehicleId)||0)+1);
   if(row.driverId)driverCounts.set(row.driverId,(driverCounts.get(row.driverId)||0)+1);
 }
 const manual=manualBookings.filter(x=>x.date===date);
 const manualByCar=new Map(manual.map(x=>[canonicalPlate(x.vehicleId),x]));
 const manualByDriver=new Map(manual.map(x=>[canonicalDa(x.driverId),x]));
 return claims.map(row=>{
   let reason=row.reason;
   const m=manualByCar.get(row.vehicleId);
   const mByDriver=row.driverId?manualByDriver.get(row.driverId):null;
   if(carCounts.get(row.vehicleId)>1||row.driverId&&driverCounts.get(row.driverId)>1)reason='duplicate_roster';
   if(m&&canonicalDa(m.driverId)!==row.driverId||mByDriver&&canonicalPlate(mByDriver.vehicleId)!==row.vehicleId)reason='manual_disagreement';
   return {...row,status:reason?'review':m?'confirmed':'source_plan',
     reason,manualBookingId:m?.id||null,autoEligible:!reason};
 });
}
export function resolveAttendanceByRoster({events=[],sourceRows=[],manualBookings=[],drivers=[],vehicles=[]}={}){
 const cache=new Map(),issues=[];
 const resolved=events.map(event=>{
   // Do not alter historic source events. This copy only supplies vehicleId
   // when today's unique, conflict-free schedule supports it.
   if(event.type!=='Log In' || event.vehicleId)return {...event};
   const date=String(event.eventTime||'').slice(0,10),da=canonicalDa(event.daCode);
   if(!validDay(date)||!da)return {...event};
   if(!cache.has(date))cache.set(date,reconcileDailyRoster({date,sourceRows,manualBookings,drivers,vehicles}));
   const suggestions=cache.get(date).filter(x=>x.driverId===da);
   const manual=manualBookings.filter(x=>x.date===date&&canonicalDa(x.driverId)===da);
   const exact=suggestions.length===1&&suggestions[0].autoEligible?suggestions[0]:null;
   const chosen=manual.length===1?manual[0]:exact;
   if(!chosen || suggestions.some(x=>x.reason==='manual_disagreement') ||
     manual.length>1 || suggestions.length>1 ||
     (exact&&manual.length&&canonicalPlate(manual[0].vehicleId)!==exact.vehicleId)){
     issues.push({kind:'vehicle_assignment_review',eventId:event.id,daCode:da,date});
     return {...event,vehicleId:''};
   }
   const vehicleId=canonicalPlate(chosen.vehicleId);
   if(!knownAutoVehicle(vehicleId,vehicles,drivers,da)){
     issues.push({kind:'vehicle_unavailable',eventId:event.id,daCode:da,date});
     return {...event,vehicleId:''};
   }
   // A lone manual booking remains an authoritative operator decision.
   return {...event,vehicleId,assignmentSource:manual.length?'manual':'VEHICLE_Fuel_Database'};
 });
 return {events:resolved,issues};
}
function knownAutoVehicle(plate,vehicles,drivers,da){
 return vehicles.some(x=>canonicalPlate(x.plate||x.id)===plate&&x.status==='Elérhető')&&
   drivers.some(x=>canonicalDa(x.daCode||x.id)===da&&x.active===true);
}
