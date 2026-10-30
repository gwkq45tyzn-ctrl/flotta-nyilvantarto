// iMile Management – staging-only, tisztán kliensoldali és olvasásra épülő migrációs segédfüggvények.
// Az éles Flotta Nyilvántartó adatbázisába semmit nem írunk.
export const MIGRATION_VERSION = 'staging-v1';
export const NORMALIZATION = Object.freeze({drivers:'DA-kód (nagybetűs)',vehicles:'rendszám (szóköz és kötőjel nélkül)'});
export const canonicalDa = s => String(s ?? '').trim().toUpperCase().replace(/\s+/g,'');
export const canonicalPlate = s => String(s ?? '').trim().toUpperCase().replace(/[\s-]+/g,'');
export const isValidDa = da => /^[A-Z0-9_-]{4,40}$/.test(da);
export const isValidPlate = plate => /^[A-Z0-9]{4,12}$/.test(plate);
export function normalizeVehicleStatus(s) {
  switch(String(s||'').trim().toLowerCase()){
    case 'aktiv':case 'hasznalatban':case 'használatban':case 'active':case 'elérhető':return 'Elérhető';
    case 'szerviz':case 'service':case 'szervizben':return 'Szerviz';
    case 'leallitott':case 'leállított':case 'eladva':case 'sold':return 'Leállított';
    default:return 'Felülvizsgálandó';
  }
}
export function normalizeDriverStatus(s) {
  switch(String(s||'').trim().toLowerCase()){
    case 'aktiv':case 'active':return 'Aktív';
    case 'inaktiv':case 'inactive':return 'Inaktív';
    default:return 'Felülvizsgálandó';
  }
}
const nonempty = v => String(v ?? '').trim();
function schemaGuard(data) {
  if(!data || typeof data !== 'object' || Array.isArray(data))throw new Error('A fájl nem JSON objektum.');
  for(const key of ['vehicles','drivers'])if(!Array.isArray(data[key]))throw new Error('Hiányzó vagy hibás lista: '+key);
  if(data.vehicles.length>10000||data.drivers.length>20000)throw new Error('A bemeneti állomány meghaladja az ellenőrzési korlátot.');
}
function duplicateRecords(items,idField,label){
  const map = new Map();
  const duplicates=[];
  for(const row of items){
    const id=row[idField];if(!id)continue;
    const prev=map.get(id);
    if(prev)duplicates.push({type:'duplicate',target:label,id,sourceIds:[prev.fleetId,row.fleetId]});
    else map.set(id,row);
  }
  return duplicates;
}
export function previewFleetMigration(data){
  schemaGuard(data);
  const issues=[];
  const vehicles=[];
  const drivers=[];
  for(const row of data.vehicles){
    if(!row||typeof row!=='object'){issues.push({type:'invalid_row',target:'vehicle'});continue;}
    const plate=nonempty(row.rendszam||row.plate).toUpperCase();
    const key=canonicalPlate(plate);
    const fleetId=nonempty(row.id);
    if(!isValidPlate(key)){issues.push({type:'missing_or_invalid_plate',target:'vehicle',fleetId});continue;}
    const status=normalizeVehicleStatus(row.status);
    if(status==='Felülvizsgálandó')issues.push({type:'unknown_status',target:'vehicle',id:key,fleetId});
    if(!fleetId)issues.push({type:'missing_legacy_id',target:'vehicle',id:key});
    vehicles.push({
      id:key,plate,model:[nonempty(row.gyartmany),nonempty(row.modell)].filter(Boolean).join(' '),
      status,legacyStatus:nonempty(row.status),fleetId,
      // A flotta okmányait/szervizadatait NEM költöztetjük automatikusan.
      fleetDataRetainedInLegacy:true
    });
  }
  for(const row of data.drivers){
    if(!row||typeof row!=='object'){issues.push({type:'invalid_row',target:'driver'});continue;}
    const id=canonicalDa(row.daCode);
    const fleetId=nonempty(row.id);
    if(!isValidDa(id)){issues.push({type:'missing_or_invalid_da',target:'driver',fleetId});continue;}
    const status=normalizeDriverStatus(row.status);
    if(status==='Felülvizsgálandó')issues.push({type:'unknown_status',target:'driver',id,fleetId});
    if(!fleetId)issues.push({type:'missing_legacy_id',target:'driver',id});
    drivers.push({
      id,daCode:id,name:nonempty(row.name),vendor:nonempty(row.agency||row.vendor),
      status,legacyStatus:nonempty(row.status),fleetId,
      // A kapacitást nem becsüljük meg, 0 = még nincs megadva.
      capacity:0,active:status==='Aktív'
    });
  }
  issues.push(...duplicateRecords(vehicles,'id','vehicle'),...duplicateRecords(drivers,'id','driver'));
  for(const driver of drivers)if(!driver.name)issues.push({type:'missing_name',target:'driver',id:driver.id});
  const critical=issues.filter(x=>['duplicate','missing_or_invalid_plate','missing_or_invalid_da','invalid_row','missing_name'].includes(x.type));
  return {
    version:MIGRATION_VERSION,
    origin:'offline_fleet_json',
    counts:{sourceVehicles:data.vehicles.length,sourceDrivers:data.drivers.length,preparedVehicles:vehicles.length,preparedDrivers:drivers.length,issues:issues.length,critical:critical.length},
    vehicles,drivers,issues,
    // Nem alkalmas közvetlen éles importként: felhasználói ellenőrzés és jogvédett szerveroldali feltöltés kell.
    readyForManualReview:critical.length===0,
    uploadEnabled:false
  };
}
