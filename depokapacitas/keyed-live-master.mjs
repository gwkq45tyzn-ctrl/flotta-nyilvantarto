/**
 * Keyed live master projection for #156.
 * Fail-closed: any missing, malformed, unconfirmed or duplicate source
 * blocks the entire projection. Never silently drop bad records.
 */
function normDA(s){return String(s||'').trim().toUpperCase();}
function normPlate(s){return String(s||'').replace(/[ -]/g,'').toUpperCase();}
function isConfirmed(snap){
  return snap && snap.metadata && snap.metadata.fromCache===false && snap.metadata.hasPendingWrites===false;
}
function validDriver(doc){
  const d=doc.data();
  return d && typeof d.daCode==='string' && normDA(d.daCode)===doc.id
    && Number.isSafeInteger(d.kapacitas) && d.kapacitas>=0 && d.kapacitas<=10000
    && ['aktiv','aktív'].includes(d.status);
}
function validVehicle(doc){
  const v=doc.data();
  return v && typeof v.rendszam==='string' && normPlate(v.rendszam)===doc.id
    && ['aktiv','aktív','szerviz'].includes(v.status);
}
export function projectKeyedMasters(driversSnap, vehiclesSnap, fleet){
  if(!fleet || fleet.sealed!==true) return null;
  if(!isConfirmed(driversSnap) || !isConfirmed(vehiclesSnap)) return null;
  const archiveDAs=new Set();
  for(const d of (fleet.drivers||[])){
    const id=normDA(d.daCode);
    if(!id || archiveDAs.has(id)) return null;
    archiveDAs.add(id);
  }
  const archivePlates=new Set();
  for(const v of (fleet.vehicles||[])){
    const id=normPlate(v.rendszam);
    if(!id || archivePlates.has(id)) return null;
    archivePlates.add(id);
  }
  const drivers=[];
  for(const doc of driversSnap.docs||[]){
    if(!validDriver(doc)) return null;
    if(!archiveDAs.has(doc.id)) return null;
    drivers.push({id:doc.id,daCode:doc.data().daCode,capacity:doc.data().kapacitas,status:doc.data().status,history:doc.data().history||[]});
  }
  if(drivers.length!==archiveDAs.size) return null;
  const vehicles=[];
  for(const doc of vehiclesSnap.docs||[]){
    if(!validVehicle(doc)) return null;
    if(!archivePlates.has(doc.id)) return null;
    const status=doc.data().status==='szerviz'?'Szerviz':'Elérhető';
    vehicles.push({id:doc.id,rendszam:doc.data().rendszam,status,history:doc.data().history||[]});
  }
  if(vehicles.length!==archivePlates.size) return null;
  return {trusted:true,drivers,vehicles,source:'keyed'};
}
export function capacityFromKeyed(keyed, daId){
  if(!keyed || !keyed.trusted) return null;
  const d=keyed.drivers.find(x=>x.id===daId);
  return d ? d.capacity : null;
}
