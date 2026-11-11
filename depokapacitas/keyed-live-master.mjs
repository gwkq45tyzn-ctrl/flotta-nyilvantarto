/**
 * V1 Depot live operational Fleet projection from server-confirmed keyed docs.
 * Pure: no Firestore writes. A separate attested sealed-source/UID policy
 * gate in app.js is REQUIRED before its result may be trusted.
 */
const validDA=s=>typeof s==='string'&&/^[A-Za-z0-9_-]{4,40}$/.test(s.trim());
const validPlate=s=>typeof s==='string'&&/^[A-Za-z0-9 -]{4,40}$/.test(s);
const normDA=s=>validDA(s)?s.trim().toUpperCase():'';
const normPlate=s=>validPlate(s)?s.replace(/[ -]/g,'').toUpperCase():'';
const confirmed=snap=>snap&&snap.metadata?.fromCache===false&&
  snap.metadata?.hasPendingWrites===false&&Array.isArray(snap.docs);
const plain=x=>x&&typeof x==='object'&&!Array.isArray(x);
function archiveIds(records,key,normalize) {
  if(!Array.isArray(records))return null;
  const seen=new Set();
  for(const item of records){
    if(!plain(item))return null;
    const id=normalize(item[key]);
    if(!id||seen.has(id))return null;
    seen.add(id);
  }
  return seen;
}
export function projectKeyedMasters(driversSnap,vehiclesSnap,fleet) {
  if(!plain(fleet)||fleet.sealed!==true||
     !confirmed(driversSnap)||!confirmed(vehiclesSnap))return null;
  const archivedDAs=archiveIds(fleet.drivers,'daCode',normDA);
  const archivedPlates=archiveIds(fleet.vehicles,'rendszam',normPlate);
  if(!archivedDAs||!archivedPlates)return null;
  const drivers=[],vehicles=[],seenD=new Set(),seenV=new Set();
  for(const item of driversSnap.docs){
    if(!item||typeof item.id!=='string'||typeof item.data!=='function'||
       seenD.has(item.id)||!archivedDAs.has(item.id))return null;
    seenD.add(item.id);
    const d=item.data();
    if(!plain(d)||normDA(d.daCode)!==item.id||
       !Number.isSafeInteger(d.kapacitas)||d.kapacitas<0||d.kapacitas>10000||
       !['aktiv','aktív','inaktiv','inaktív'].includes(d.status)||
       ('history' in d&&!Array.isArray(d.history)))return null;
    drivers.push({
      id:item.id,daCode:item.id,name:String(d.name||d.nev||''),
      vendor:String(d.agency||d.vendor||''),
      active:['aktiv','aktív'].includes(d.status),
      status:d.status,capacity:d.kapacitas,history:d.history||[]
    });
  }
  for(const item of vehiclesSnap.docs){
    if(!item||typeof item.id!=='string'||typeof item.data!=='function'||
       seenV.has(item.id)||!archivedPlates.has(item.id))return null;
    seenV.add(item.id);
    const v=item.data();
    if(!plain(v)||normPlate(v.rendszam)!==item.id||
       !['aktiv','aktív','szerviz','inaktiv','inaktív'].includes(v.status)||
       ('history' in v&&!Array.isArray(v.history)))return null;
    vehicles.push({
      id:item.id,plate:item.id,rendszam:v.rendszam,
      model:String(v.model||[v.gyartmany,v.modell].filter(Boolean).join(' ')),
      status:['aktiv','aktív'].includes(v.status)?'Elérhető':
        v.status==='szerviz'?'Szerviz':'Leállított',
      history:v.history||[]
    });
  }
  if(drivers.length!==archivedDAs.size||vehicles.length!==archivedPlates.size)
    return null;
  return {trusted:true,status:'ready',reason:null,source:'keyed-live',
    liveVerified:false,drivers,vehicles};
}
/** Unknown driver/invalid source must never become a zero-capacity trusted driver. */
export function capacityFromKeyed(keyed,daId){
  if(!keyed?.trusted)return null;
  const driver=keyed.drivers.find(x=>x.id===daId);
  return driver?driver.capacity:null;
}
