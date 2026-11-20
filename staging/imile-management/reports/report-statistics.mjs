/** Pure OFD snapshot planning and weighted courier/vendor analytics.
 * Never contacts Firebase, never implicitly approves a report.
 */
const day=x=>typeof x==='string'&&/^20\d{2}-\d\d-\d\d$/.test(x)&&
 new Date(x+'T12:00:00Z').toISOString().slice(0,10)===x;
const name=x=>typeof x==='string'&&x.trim().length>0&&x.length<=160&&!/[\u0000-\u001f]/.test(x);
const number=x=>Number.isSafeInteger(x)&&x>=0&&x<=10000000;
const compare=(a,b)=>a.localeCompare(b,'hu',{numeric:true});
export const docKey=(date,station)=>{
 if(!day(date)||!name(station))throw Error('Érvénytelen dátum vagy depó.');
 return date+'__'+encodeURIComponent(station);
};
export function planPerformanceSnapshots(report){
 if(report?.kind!=='ofd'||report.status!=='ready'||!Array.isArray(report.rows)||!report.rows.length||
  report.rows.length>5000)throw Error('Csak teljes, ellenőrzött OFD-riport menthető.');
 const byStation=new Map(),seen=new Map();
 for(const r of report.rows){
  if(!day(r.date)||!name(r.station)||!name(r.code)||!name(r.name)||!name(r.vendor)||
    !number(r.ofd)||!number(r.delivered)||r.delivered>r.ofd)
   throw Error('Hibás napi futárteljesítmény. A mentés tiltva.');
  const key=docKey(r.date,r.station),id=JSON.stringify([key,r.code]);
  if(seen.has(id))throw Error('Egy futár egy depóban egy nap csak egyszer szerepelhet. Az eltérő vállalkozót kézzel kell egyeztetni: '+r.code);
  seen.set(id,true);
  if(!byStation.has(key))byStation.set(key,{key,date:r.date,station:r.station,rows:[],totalOFD:0,totalDelivered:0});
  const block=byStation.get(key);
  block.rows.push({daCode:r.code,daName:r.name,vendor:r.vendor,ofd:r.ofd,delivered:r.delivered});
  block.totalOFD+=r.ofd;block.totalDelivered+=r.delivered;
  if(!number(block.totalOFD))throw Error('Túl nagy összesített csomagszám.');
 }
 return [...byStation.values()].map(x=>({...x,rows:x.rows.sort((a,b)=>compare(a.daCode,b.daCode)),courierCount:x.rows.length}))
  .sort((a,b)=>compare(a.key,b.key));
}
/** No averaging percentages: all ratios derive from summed packages. */
export function buildPerformanceStatistics(dailyDocs){
 if(!Array.isArray(dailyDocs))throw Error('Hiányoznak a statisztikai források.');
 const days=new Map(),couriers=new Map(),vendors=new Map(),issues=[];
 for(const d of dailyDocs){
  if(!d||!day(d.date)||!name(d.station)||!Array.isArray(d.rows)||d.rows.length>300||
    d.key!==docKey(d.date,d.station)||!['provisional','final'].includes(d.status)){
   issues.push('invalid_daily_report');continue;
  }
  if(days.has(d.key)){issues.push('duplicate_daily_report');continue;}days.set(d.key,d);
  for(const r of d.rows){
   if(!name(r.daCode)||!name(r.daName)||!name(r.vendor)||!number(r.ofd)||
    !number(r.delivered)||r.delivered>r.ofd){issues.push('invalid_courier_record');continue;}
   const ck=r.daCode,vk=JSON.stringify([d.date,d.station,r.vendor]);
   if(!couriers.has(ck))couriers.set(ck,{daCode:ck,latestName:r.daName,ofd:0,delivered:0,days:new Set(),vendors:new Set(),finalDays:0});
   const courier=couriers.get(ck);
   courier.latestName=r.daName;courier.ofd+=r.ofd;courier.delivered+=r.delivered;
   courier.days.add(d.date+'__'+d.station);courier.vendors.add(r.vendor);
   if(d.status==='final')courier.finalDays++;
   if(!vendors.has(vk))vendors.set(vk,{date:d.date,station:d.station,vendor:r.vendor,ofd:0,delivered:0,couriers:new Set(),status:d.status});
   const v=vendors.get(vk);v.ofd+=r.ofd;v.delivered+=r.delivered;v.couriers.add(r.daCode);
  }
 }
 const rate=(del,ofd)=>ofd?del/ofd:null;
 const courierRows=[...couriers.values()].map(x=>({
  daCode:x.daCode,daName:x.latestName,ofd:x.ofd,delivered:x.delivered,
  rate:rate(x.delivered,x.ofd),days:x.days.size,finalDays:x.finalDays,vendors:[...x.vendors].sort(compare)
 })).sort((a,b)=>b.ofd-a.ofd||compare(a.daCode,b.daCode));
 const vendorRows=[...vendors.values()].map(x=>({
  date:x.date,station:x.station,vendor:x.vendor,ofd:x.ofd,delivered:x.delivered,
  rate:rate(x.delivered,x.ofd),couriers:x.couriers.size,spr:x.ofd/x.couriers.size,status:x.status
 })).sort((a,b)=>compare(b.date,a.date)||compare(a.vendor,b.vendor));
 const totalOFD=courierRows.reduce((n,x)=>n+x.ofd,0),totalDelivered=courierRows.reduce((n,x)=>n+x.delivered,0);
 return {couriers:courierRows,vendors:vendorRows,reportDays:days.size,totalOFD,totalDelivered,
  rate:rate(totalDelivered,totalOFD),issues,partial:issues.length>0};
}
export function canonicalSnapshot(snapshot){
 // Precise stable serialization for SHA256: sorted rows, same contents -> same digest.
 return JSON.stringify({date:snapshot.date,station:snapshot.station,
  rows:snapshot.rows.map(x=>[x.daCode,x.daName,x.vendor,x.ofd,x.delivered]),
  ofd:snapshot.totalOFD,delivered:snapshot.totalDelivered});
}
export async function snapshotHash(snapshot){
 const bytes=new TextEncoder().encode(canonicalSnapshot(snapshot));
 const digest=await crypto.subtle.digest('SHA-256',bytes);
 return Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');
}
