/**
 * Read-only, privacy-minimizing iMile core cutover gate.
 * No network, no Firestore writes, no PII, no automated import.
 *
 * Legacy Fleet browser snapshot contains more than just canonical driver/vehicle
 * IDs. This check prevents claiming that a master-only migration is complete.
 */
import {planSharedMasterMigration} from './shared-import-plan.mjs';
import {canonicalDa,canonicalPlate,isValidDa,isValidPlate,normalizeDriverStatus,normalizeVehicleStatus} from './shared-records.mjs';

const LEGACY_FIELDS=[
 'alvazszam','km','biztositasSzam','helyszin','biztositasLejarat',
 'muszakiLejarat','cascoLejarat','kovetkezoSzervizKm','kovetkezoSzervizDatum',
 'gumicsere','berbeado','berletiSzerzodesLejarat','megjegyzes','statusSince',
 'utolsoLezartSzervizIdopont'
];
const DRIVER_FIELDS=['phone','licenseExpiry','since','note'];
const filled=v=>v!==undefined&&v!==null&&String(v).trim()!=='';
const countExtra=(rows,fields)=>rows.reduce((n,row)=>n+
 fields.filter(name=>row&&filled(row[name])).length,0);
const countHistory=rows=>rows.reduce((n,row)=>n+
 (Array.isArray(row?.history)?row.history.length:0),0);
const countsOf=rows=>Array.isArray(rows)?rows.length:0;
const exactBool=(x,name)=>{if(typeof x!=='boolean')throw Error(name+' must be explicitly true or false');return x;};
/** Returns 1-based JSON array positions only: no names, DA codes, plate numbers or original labels. */
function privateReviewPositions(vehicles,drivers){
 const unknownDriverStatusPositions=drivers.flatMap((row,i)=>
  row&&typeof row==='object'&&!Array.isArray(row)&&isValidDa(canonicalDa(row.daCode))&&
  normalizeDriverStatus(row.status)==='Felülvizsgálandó'?[i+1]:[]);
 const unknownVehicleStatusPositions=vehicles.flatMap((row,i)=>
  row&&typeof row==='object'&&!Array.isArray(row)&&
  isValidPlate(canonicalPlate(row.rendszam||row.plate))&&
  normalizeVehicleStatus(row.status)==='Felülvizsgálandó'?[i+1]:[]);
 const vehicleUserMappingPositions=[];
 const labelGroups=new Map();
 vehicles.forEach((row,i)=>{
  if(!row||!filled(row.currentDriver))return;
  const position=i+1;vehicleUserMappingPositions.push(position);
  if(typeof row.currentDriver!=='string')return;
  const normalized=row.currentDriver.trim().replace(/\s+/g,' ').toLocaleLowerCase('hu-HU');
  if(!labelGroups.has(normalized))labelGroups.set(normalized,[]);
  labelGroups.get(normalized).push(position);
 });
 const repeatedVehicleUserGroups=[...labelGroups.values()].filter(group=>group.length>1)
  .map(group=>Object.freeze(group.slice()));
 return Object.freeze({
  unknownDriverStatusPositions:Object.freeze(unknownDriverStatusPositions),
  unknownVehicleStatusPositions:Object.freeze(unknownVehicleStatusPositions),
  vehicleUserMappingPositions:Object.freeze(vehicleUserMappingPositions),
  repeatedVehicleUserGroups:Object.freeze(repeatedVehicleUserGroups)
 });
}
export function assessFleetCutover({legacy,staging,proof}={}){
 if(!legacy||typeof legacy!=='object'||Array.isArray(legacy))
  throw Error('Érvénytelen régi Flotta-mentés.');
 if(!staging||typeof staging!=='object'||!Array.isArray(staging.drivers)||
  !Array.isArray(staging.vehicles))
  throw Error('Nincs megbízható staging törzsadat-export.');
 if(!proof||typeof proof!=='object'||Array.isArray(proof))
  throw Error('Hiányoznak a külön elfogadási kapuk.');
 for(const name of ['legacyServerVersionConfirmed','legacyPendingLocalChangesResolved',
 'legacyFullBackupVerified','stagingRestoreTestPassed','dedicatedUsersApproved',
 'durableHostingReady','businessDataMigrationApproved']){
  exactBool(proof[name],name);
 }
 const source=planSharedMasterMigration(legacy,{drivers:staging.drivers,vehicles:staging.vehicles});
 // The planner's blocker total includes legacy quality errors as well as
 // true same-key destination conflicts. Never label their sum "conflicts".
 const sourceIssueTypes=new Set([
  'duplicate','missing_or_invalid_plate','missing_or_invalid_da',
  'invalid_row','missing_name','unknown_status'
 ]);
 const destinationIssueTypes=new Set(['invalid_existing_row','invalid_existing_id','duplicate_existing']);
 const sourceQualityBlockers=source.problems.filter(p=>sourceIssueTypes.has(p.type)).length;
 const stagingIntegrityBlockers=source.problems.filter(p=>destinationIssueTypes.has(p.type)).length;
 const actualMasterConflicts=source.counts.conflictingDrivers+source.counts.conflictingVehicles;
 const unknownDriverStatuses=source.problems.filter(p=>p.type==='unknown_status'&&p.target==='driver').length;
 const unknownVehicleStatuses=source.problems.filter(p=>p.type==='unknown_status'&&p.target==='vehicle').length;
 const classified=sourceQualityBlockers+stagingIntegrityBlockers+actualMasterConflicts;
 if(classified>source.counts.blockers)
  throw Error('Az átállási akadályok összesítése ellentmondásos.');
 // Future planner blocker types must remain blocking, even if not yet classified.
 const otherMasterBlockers=source.counts.blockers-classified;
 for(const name of ['fuelCards','contacts'])if(!Array.isArray(legacy[name]))
  throw Error('Hiányos régi Flotta export: '+name);
 const {vehicles,drivers,fuelCards,contacts}=legacy;
 const history=countHistory(vehicles)+countHistory(drivers);
 const populatedVehicleMetadata=countExtra(vehicles,LEGACY_FIELDS);
 const populatedDriverMetadata=countExtra(drivers,DRIVER_FIELDS);
 const activeLegacyAssignments=vehicles.filter(v=>v&&filled(v.currentDriver)).length;
 const reviewQueue=privateReviewPositions(vehicles,drivers);
 if(reviewQueue.unknownDriverStatusPositions.length!==unknownDriverStatuses||
    reviewQueue.unknownVehicleStatusPositions.length!==unknownVehicleStatuses||
    reviewQueue.vehicleUserMappingPositions.length!==activeLegacyAssignments)
  throw Error('Nem egyeznek a felülvizsgálandó forrásrekordok darabszámai.');
 const missingDetails=[
  {type:'fuelCards',count:fuelCards.length},
  {type:'contacts',count:contacts.length},
  {type:'vehicleHistory',count:countHistory(vehicles)},
  {type:'driverHistory',count:countHistory(drivers)},
  {type:'vehicleMetadataFields',count:populatedVehicleMetadata},
  {type:'driverMetadataFields',count:populatedDriverMetadata},
  {type:'legacyActiveVehicleAssignments',count:activeLegacyAssignments}
 ].filter(x=>x.count>0);
 const holds=[
  ...Object.entries(proof).filter(([k,v])=>v===false).map(([key])=>({reason:'approval_or_backup_missing',gate:key})),
  ...(sourceQualityBlockers?[{reason:'legacy_source_quality',count:sourceQualityBlockers,
   unknownDriverStatuses,unknownVehicleStatuses}]:[]),
  ...(stagingIntegrityBlockers?[{reason:'staging_master_integrity',count:stagingIntegrityBlockers}]:[]),
  ...(actualMasterConflicts?[{reason:'master_data_conflict',count:actualMasterConflicts}]:[]),
  ...(otherMasterBlockers?[{reason:'other_master_blockers',count:otherMasterBlockers}]:[]),
  ...(source.counts.newDrivers+source.counts.newVehicles? [{
   reason:'unmigrated_master_records',
   drivers:source.counts.newDrivers,vehicles:source.counts.newVehicles
  }]:[]),
  ...missingDetails.map(x=>({reason:'legacy_detail_not_migrated',category:x.type,count:x.count}))
 ];
 const stats={
  legacyVehicles:countsOf(vehicles),legacyDrivers:countsOf(drivers),
  legacyFuelCards:fuelCards.length,legacyContacts:contacts.length,
  legacyHistoryEvents:history,
  legacyActiveVehicleAssignments:activeLegacyAssignments,
  newDrivers:source.counts.newDrivers,newVehicles:source.counts.newVehicles,
  matchedDrivers:source.counts.matchedDrivers,matchedVehicles:source.counts.matchedVehicles,
  conflictingDrivers:source.counts.conflictingDrivers,
  conflictingVehicles:source.counts.conflictingVehicles,
  sourceQualityBlockers,unknownDriverStatuses,unknownVehicleStatuses,
  stagingIntegrityBlockers,otherMasterBlockers,
  legacyMetadataFields:populatedVehicleMetadata+populatedDriverMetadata
 };
 return Object.freeze({
  version:'core-cutover-preflight-v1',project:'imile-management-staging',
  readOnly:true,writesAllowed:false,personalDataIncluded:false,
  sourceOriginVerified:false,counts:stats,holds,reviewQueue,
  readiness:holds.length===0?'review-ready-not-approved':'blocked',
  note:'A helyi fájl nem bizonyítja a központi Apps Script verzió vagy a forrásadatok valódiságát. A tényleges átállás csak külön, tranzakciós import és végső mentés után lehetséges.'
 });
}
