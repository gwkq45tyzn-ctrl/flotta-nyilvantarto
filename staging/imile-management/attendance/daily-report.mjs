/**
 * Read-only, local-time AKE Attendance vehicle statistics.
 * Source: native vehicleSessions documents only. No Google Sheets.
 * Checkout mileage is SELF-REPORTED until depot morning review.
 */
const LOCAL_DAY=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Budapest',year:'numeric',month:'2-digit',day:'2-digit'});
const validDay=date=>{
 if(typeof date!=='string'||!/^20\d\d-\d\d-\d\d$/.test(date))return false;
 const d=new Date(date+'T12:00:00Z');
 return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===date;
};
function datetime(value){
 try{
  const parsed=value?.toDate instanceof Function?value.toDate()
   : value instanceof Date?value
   : typeof value==='number'?new Date(value)
   : typeof value==='string'?new Date(value):null;
  return parsed instanceof Date&&Number.isFinite(parsed.getTime())?parsed:null;
 }catch{return null;}
}
const localDay=v=>{const date=datetime(v);return date?LOCAL_DAY.format(date):null};
const km=v=>Number.isInteger(v)&&v>=0&&v<=100000000;
const reject=reason=>Object.freeze({ready:false,reason});
export function attendanceDailyReport({date,sessions}={}){
 if(!validDay(date))return reject('Érvénytelen nap a napi riporthoz.');
 if(!Array.isArray(sessions))return reject('Hiányzik a hiteles Attendance-eseménylista.');
 const byDriver=new Map(),issues=[],seen=new Set();
 let checkins=0,checkouts=0,activeNow=0,awaitingReviewNow=0,reviewedToday=0,reportedKm=0,reviewedKm=0,damageReports=0,cleanlinessReports=0;
 const conditionFlags=[];
 for(const session of sessions){
  if(!session||typeof session.id!=='string'||!session.id){
   issues.push({id:'(hiányzik)',reason:'Hiányzó eseményazonosító'});continue;
  }
  if(seen.has(session.id)){
   issues.push({id:session.id,reason:'Duplikált esemény'});continue;
  }
  seen.add(session.id);
  const started=localDay(session.startedAt);
  const finished=localDay(session.endedAt);
  if(session.status==='active')activeNow++;
  if(session.status==='awaiting_review')awaitingReviewNow++;
  if(started===date)checkins++;
  if(finished!==date)continue;
  if(!['awaiting_review','reviewed'].includes(session.status)){
   issues.push({id:session.id,reason:'Lezárási időpont nem megfelelő státusszal'});continue;
  }
  if(!km(session.startKm)||!km(session.endKm)||session.endKm<session.startKm){
   issues.push({id:session.id,reason:'Érvénytelen kezdő vagy záró kilométeróra'});continue;
  }
  const distance=session.endKm-session.startKm;
  const driverId=String(session.driverId||'').trim();
  if(!/^[A-Za-z0-9_-]{4,40}$/.test(driverId)){
   issues.push({id:session.id,reason:'Hiányzó vagy hibás DA-kód'});continue;
  }
  checkouts++;
  reportedKm+=distance;
  if(session.status==='reviewed'){reviewedToday++;reviewedKm+=distance;}
  const row=byDriver.get(driverId)||{driverId,checkouts:0,reviewed:0,reportedKm:0,reviewedKm:0,damageReports:0,cleanlinessReports:0,plates:new Set()};
  const damage=typeof session.damageNote==='string'&&session.damageNote.trim().length>0;
  const cleanliness=typeof session.cleanlinessNote==='string'&&session.cleanlinessNote.trim().length>0;
  if(damage) {damageReports++;row.damageReports++;}
  if(cleanliness) {cleanlinessReports++;row.cleanlinessReports++;}
  if(damage||cleanliness)conditionFlags.push({id:session.id,driverId,plate:String(session.plate||''),damage,cleanliness,status:session.status});
  row.checkouts++;row.reportedKm+=distance;
  if(session.status==='reviewed'){row.reviewed++;row.reviewedKm+=distance;}
  if(session.plate)row.plates.add(String(session.plate));
  byDriver.set(driverId,row);
 }
 const couriers=[...byDriver.values()].map(row=>({
  driverId:row.driverId,checkouts:row.checkouts,reviewed:row.reviewed,
  reportedKm:row.reportedKm,reviewedKm:row.reviewedKm,
  damageReports:row.damageReports,cleanlinessReports:row.cleanlinessReports,
  plates:[...row.plates].sort()
 })).sort((a,b)=>b.reportedKm-a.reportedKm||a.driverId.localeCompare(b.driverId));
 return {ready:true,date,checkins,checkouts,activeNow,awaitingReviewNow,reviewedToday,
  reportedKm,reviewedKm,damageReports,cleanlinessReports,conditionFlags,issues,couriers};
}

/** Excel-compatible UTF-8 semicolon CSV; never execute spreadsheet formulas. */
export function attendanceReportCsv(report){
 if(!report?.ready||!validDay(report.date)||!Array.isArray(report.couriers))
  throw Error('Csak ellenőrzött napi riport exportálható.');
 const field=value=>{
  let str=String(value??'');
  // Keep untrusted identifiers from becoming Excel/Sheets formulas.
  str=str.replace(/[\r\n]/g,' ');
  if(/^\s*[=+@\-]/.test(str))str="'"+str;
  return '"'+str.replace(/"/g,'""')+'"';
 };
 const rows=[
  ['Nap','Futár DA','Kicsekkolások','Reggel ellenőrzött','Bejelentett km','Visszaigazolt km','Sérülésjelzések','Tisztasági jelzések','Rendszámok'],
  ...report.couriers.map(x=>[
   report.date,x.driverId,x.checkouts,x.reviewed,x.reportedKm,x.reviewedKm,x.damageReports||0,x.cleanlinessReports||0,(x.plates||[]).join(', ')
  ])
 ];
 return '\uFEFF'+rows.map(row=>row.map(field).join(';')).join('\r\n')+'\r\n';
}
