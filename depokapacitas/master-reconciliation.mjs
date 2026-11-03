/**
 * ORIGINAL Fleet ↔ Depo canonical master reconciliation.
 *
 * Read-only. No Firestore writes, merges, mutations, or automatic cutover.
 * An authoritative migration requires separately verified Rules, signed-off
 * source parity, backup/rollback and user approval.
 *
 * Trust boundary: requires a confirmed Fleet server snapshot AND confirmed
 * Depo drivers/vehicles/bookings server snapshots (no cache/pending writes).
 */
const normalizeDriver=x=>typeof x==='string'?x.trim().toUpperCase():'';
const normalizeVehicle=x=>typeof x==='string'?x.trim().replace(/[\s-]/g,'').toUpperCase():'';
const txt=x=>typeof x==='string'?x.trim():'';
const validSource=values=>Array.isArray(values)&&values.every(v=>v&&typeof v==='object'&&!Array.isArray(v));
const trustOk=m=>m&&m.loaded===true&&m.error!==true&&m.fromCache!==true&&
  m.pending!==true&&typeof m.serverAt==='number'&&Number.isFinite(m.serverAt)&&m.serverAt>0;
const fields=Object.freeze({
  driver:['daCode','name','vendor','capacity','active'],
  vehicle:['plate','model','status']
});
const unchanged=()=>({status:'waiting',ready:false,issues:[],items:[],counts:{
  matching:0,different:0,onlyFleet:0,onlyDepo:0,bookingsAtRisk:0
}});

const normalizedValue=(kind,field,value)=>{
  if(kind==='driver'&&field==='daCode')return normalizeDriver(value);
  if(kind==='vehicle'&&field==='plate')return normalizeVehicle(value);
  if(field==='name'||field==='vendor'||field==='model'||field==='status')return txt(value);
  return value;
};

/**
 * @param {object} source projectSharedFleetSnapshot() result, already redacted.
 * @param {object} depo {drivers, vehicles, bookings} current snapshots.
 * @param {object} sources Firestore server-confirmed metadata (drivers,vehicles,bookings).
 */
export function reconcileSharedMaster(source,depo={},sources={}){
  const out=unchanged();
  if(!source||source.status!=='preview'){
    return {...out,status:'blocked',issues:[{
      reason:'flotta_not_verified',detail:'Nincs hibátlan, szerverről igazolt, csak olvasható Flotta-előnézet.'
    }]};
  }
  if(!['drivers','vehicles','bookings'].every(k=>trustOk(sources[k]))){
    return {...out,status:'waiting',issues:[{
      reason:'depo_source_unconfirmed',
      detail:'A Depó futár-, jármű- és foglalási adatai közül nem mindegyik szerver-visszaigazolt.'
    }]};
  }
  if(!validSource(depo.drivers)||!validSource(depo.vehicles)||!validSource(depo.bookings)||
     !validSource(source.drivers)||!validSource(source.vehicles)){
    return {...out,status:'blocked',issues:[{
      reason:'invalid_snapshot',detail:'Hiányos vagy hibás Flotta/Depó rekordlista.'
    }]};
  }
  const items=[],issues=[];
  const counts={matching:0,different:0,onlyFleet:0,onlyDepo:0,bookingsAtRisk:0};
  const sourceMaps={driver:new Map(),vehicle:new Map()};
  const recordedKeys=new Map();

  for(const kind of ['driver','vehicle']){
    const originals=kind==='driver'?source.drivers:source.vehicles;
    const existing=kind==='driver'?depo.drivers:depo.vehicles;
    const norm=kind==='driver'?normalizeDriver:normalizeVehicle;
    const collection=kind==='driver'?'drivers':'vehicles';
    const expected=new Map();
    const actual=new Map();
    for(const item of originals){
      const id=norm(item?.id);
      if(!id||!item?.data||expected.has(id)){
        issues.push({reason:'fleet_duplicate_or_invalid',kind,id,detail:'Hiányzó vagy duplikált Flotta-azonosító'});
        continue;
      }
      expected.set(id,item.data);
    }
    for(const item of existing){
      const id=norm(item?.id);
      if(!id||actual.has(id)){
        issues.push({reason:'depo_duplicate_or_invalid',kind,id,detail:'Hiányzó vagy duplikált Depó-azonosító'});
        continue;
      }
      actual.set(id,item);
    }
    sourceMaps[kind]=expected;
    recordedKeys.set(kind,actual);
    for(const [id,projection] of expected){
      if(!actual.has(id)){
        counts.onlyFleet++;
        items.push({kind,id,status:'onlyFleet',fields:[],detail:'A Flottában létezik, a Depóban hiányzik'});
        continue;
      }
      const live=actual.get(id);
      const differences=fields[kind].filter(field=>
        !Object.is(normalizedValue(kind,field,projection[field]),
          normalizedValue(kind,field,live[field])));
      if(differences.length){
        counts.different++;
        items.push({kind,id,status:'different',fields:differences,
          detail:'A törzsadat mezői eltérnek'});
      }else{
        counts.matching++;
        items.push({kind,id,status:'matching',fields:[],detail:'Egyezik'});
      }
    }
    for(const id of actual.keys()){
      if(expected.has(id))continue;
      counts.onlyDepo++;
      items.push({kind,id,status:'onlyDepo',fields:[],
        detail:'Csak a Depóban szerepel; törléshez külön felülvizsgálat kell'});
    }
    if(existing.length!==actual.size){
      issues.push({reason:'depo_duplicate_or_invalid',kind,detail:collection+' azonosítók nem egyediek'});
    }
  }
  // Existing bookings are NEVER modified. Flag threatened links/eligibility.
  for(const booking of depo.bookings){
    if(!['planned','confirmed'].includes(booking.status))continue;
    const did=normalizeDriver(booking.driverId);
    const vid=normalizeVehicle(booking.vehicleId);
    const driver=sourceMaps.driver.get(did);
    const car=sourceMaps.vehicle.get(vid);
    const details=[];
    if(!driver)details.push('driver_missing_in_fleet');
    else if(driver.active!==true)details.push('driver_inactive_in_fleet');
    if(!car)details.push('vehicle_missing_in_fleet');
    else if(car.status!=='Elérhető')details.push('vehicle_not_available_in_fleet');
    if(details.length){
      counts.bookingsAtRisk++;
      issues.push({
        reason:'booking_at_risk',id:txt(booking.id),
        driverId:did,vehicleId:vid,fields:details,
        detail:'Aktív foglalás és a Flotta törzsállapota ütközik; automatikusan nem módosítható.'
      });
    }
  }
  const ready=issues.length===0&&counts.different===0&&counts.onlyFleet===0&&
    counts.onlyDepo===0&&counts.bookingsAtRisk===0;
  return {
    status:ready?'matching':'review',ready,
    // Pure agreement is NOT import authorization or release-ready approval.
    issues,items,counts,
    note:ready?'A két törzskészlet egyezik. Ez nem jogosít fel migrációra vagy élesítésre.':
      'A különbségek ellenőrzendők. Automatikus adatátvitel nem történt.'
  };
}
