/**
 * iMile Management staging: kizárólag olvasó terv a Flotta JSON
 * és a Firestore közös törzsadatok összevetésére.
 * NINCS hálózati kérés, NINCS adatírás, NINCS automatikus migráció.
 */
import {previewFleetMigration,canonicalDa,canonicalPlate} from './shared-records.mjs';

function asArray(value,label){
  if(!Array.isArray(value))throw new Error('Hibás Firebase adatlista: '+label);
  return value;
}
function normalized(value){return String(value??'').trim();}
function comparable(field,value){
  if(field==='vendor'||field==='name'||field==='model')return normalized(value).replace(/\s+/g,' ');
  if(field==='daCode')return canonicalDa(value);
  if(field==='plate')return canonicalPlate(value);
  if(field==='active')return value===true;
  return normalized(value);
}
function existingIndex(rows,kind,problems){
  const map=new Map();
  for(const row of rows){
    if(!row||typeof row!=='object'){problems.push({kind,type:'invalid_existing_row'});continue;}
    const key=kind==='driver'?canonicalDa(row.id||row.daCode):canonicalPlate(row.id||row.plate);
    if(!key){problems.push({kind,type:'invalid_existing_id'});continue;}
    if(map.has(key)){problems.push({kind,type:'duplicate_existing',id:key});continue;}
    map.set(key,row);
  }
  return map;
}
function planCollection(prepared,existing,kind,problems){
  const existingById=existingIndex(existing,kind,problems);
  const result={create:[],matched:[],conflicts:[]};
  for(const item of prepared){
    const key=item.id, old=existingById.get(key);
    const doc=kind==='driver'
      ? {name:item.name,daCode:item.daCode,vendor:item.vendor,capacity:0,active:item.active}
      : {plate:item.id,model:item.model,status:item.status};
    if(!old){
      result.create.push({id:key,data:doc});
      continue;
    }
    const fields=kind==='driver'?['name','daCode','vendor','active']:['plate','model','status'];
    const different=fields.filter(field=>{
      const before=field==='plate'?(old.plate||old.id):old[field];
      const after=doc[field];
      return comparable(field,before)!==comparable(field,after);
    });
    if(different.length){
      result.conflicts.push({id:key,fields:different});
      problems.push({kind,type:'existing_record_conflict',id:key,fields:different});
    } else result.matched.push({id:key});
  }
  return result;
}
export function planSharedMasterMigration(fleetBackup,currentFirestore={drivers:[],vehicles:[]}){
  const prepared=previewFleetMigration(fleetBackup);
  const problems=[...prepared.issues];
  const drivers=planCollection(prepared.drivers,asArray(currentFirestore.drivers,'drivers'),'driver',problems);
  const vehicles=planCollection(prepared.vehicles,asArray(currentFirestore.vehicles,'vehicles'),'vehicle',problems);
  const blockers=prepared.counts.critical+problems.filter(x=>['invalid_existing_row','invalid_existing_id','duplicate_existing','existing_record_conflict'].includes(x.type)).length;
  const counts={
    fleetDrivers:prepared.counts.sourceDrivers,
    fleetVehicles:prepared.counts.sourceVehicles,
    newDrivers:drivers.create.length,
    newVehicles:vehicles.create.length,
    matchedDrivers:drivers.matched.length,
    matchedVehicles:vehicles.matched.length,
    conflictingDrivers:drivers.conflicts.length,
    conflictingVehicles:vehicles.conflicts.length,
    problems:problems.length,
    blockers
  };
  return {
    version:'staging-plan-v1',
    counts,problems,
    proposed:{drivers,vehicles},
    // Importfunkció szándékosan nincs: adatíráshoz külön, felülvizsgált adminművelet kell.
    readyForReview:blockers===0,
    importEnabled:false,
    source:'local-only-legacy-flotta-backup',
    destination:'firestore-shared-master-STAGING'
  };
}
