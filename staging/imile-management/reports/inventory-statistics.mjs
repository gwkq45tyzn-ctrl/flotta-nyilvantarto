/** Pure, privacy-minimizing In-Hub inventory snapshots.
 * Stores aggregated daily station totals, area labels and receive-day buckets;
 * never persists waybill numbers or consignee addresses.
 */
import {docKey} from './report-statistics.mjs';
const validDay=s=>typeof s==='string'&&/^20\d{2}-\d\d-\d\d$/.test(s)&&
 Number.isFinite(Date.parse(s+'T12:00:00Z'))&&new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s;
const word=x=>typeof x==='string'&&x.trim().length>0&&x.length<=160;
export function planInventorySnapshot(report,matrix,snapshotDate){
 if(report?.kind!=='inhub'||report.status!=='ready'||!validDay(snapshotDate)||
 !Array.isArray(matrix)||!Array.isArray(matrix[0]))throw Error('Hiányzó, ellenőrizetlen vagy hibás napi raktárállapot.');
 const col=matrix[0].indexOf('Inventory Station');
 if(col<0)throw Error('Inventory Station oszlop nélkül nem menthető raktári statisztika.');
 const stations=new Set(matrix.slice(1).filter(r=>Array.isArray(r)&&r.some(x=>x!=null&&x!==''))
  .map(r=>r[col]));
 if(stations.size!==1||![...stations].every(word))
  throw Error('A napi raktárállapot egyetlen hiteles Inventory Station depóhoz tartozhat.');
 if(!Array.isArray(report.dates)||!report.dates.length||
  !Array.isArray(report.rows)||!report.rows.length||report.rows.length>250||
  report.dates.length>180||report.total>10000000)throw Error('Túl nagy vagy hiányos raktárkimutatás.');
 if(report.dates.some(d=>!validDay(d)||d>snapshotDate))
  throw Error('A csomag érkezési napja nem lehet későbbi, mint a kiválasztott raktárállapot napja.');
 const dates=[...report.dates],areas=report.rows.map(r=>({
  area:r.area,counts:[...r.counts]
 }));
 if(areas.some(r=>!word(r.area)||r.counts.length!==dates.length||
  r.counts.some(c=>!Number.isSafeInteger(c)||c<0||c>10000000)))
  throw Error('Hibás kerület/település raktár-összesítés.');
 const total=areas.reduce((sum,r)=>sum+r.counts.reduce((n,c)=>n+c,0),0);
 if(total!==report.total)throw Error('Nem egyezik a raktári összesítés és a csomaglista.');
 const station=[...stations][0];
 return {key:docKey(snapshotDate,station),date:snapshotDate,station,dates,areas,total};
}
export const canonicalInventory=s=>JSON.stringify({
 date:s.date,station:s.station,dates:s.dates,
 areas:s.areas.map(a=>[a.area,...a.counts])
});
export async function inventoryHash(s){
 const bytes=new TextEncoder().encode(canonicalInventory(s));
 return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))]
  .map(b=>b.toString(16).padStart(2,'0')).join('');
}
export function inventoryHistory(docs){
 if(!Array.isArray(docs))throw Error('Nincs ellenőrzött raktárstatisztika.');
 const byKey=new Map(),errors=[];
 for(const d of docs){
  if(!d||!validDay(d.date)||!word(d.station)||!Number.isSafeInteger(d.total)||d.total<0||
   d.key!==docKey(d.date,d.station)){
   errors.push('invalid_inventory_report');continue;
  }
  if(byKey.has(d.key)){errors.push('duplicate_inventory_report');continue;}
  byKey.set(d.key,d);
 }
 const days=[...byKey.values()].sort((a,b)=>b.date.localeCompare(a.date)||
  a.station.localeCompare(b.station,'hu'));
 return {rows:days.map(d=>({date:d.date,station:d.station,total:d.total,
  areas:Array.isArray(d.areas)?d.areas.length:0})),errors};
}
