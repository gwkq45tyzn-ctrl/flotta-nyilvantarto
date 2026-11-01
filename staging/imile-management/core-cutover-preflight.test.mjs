import assert from 'node:assert/strict';
import {assessFleetCutover} from './core-cutover-preflight.mjs';

const legacy=()=>({
 vehicles:[{id:'OLD_CAR_ID',rendszam:'AAA-123',gyartmany:'Ford',modell:'Transit',
  status:'aktiv',km:120000,biztositasLejarat:'2027-03-15',
  currentDriver:'DRIVER_1',history:[{type:'atadas',date:'2026-10-01'}]}],
 drivers:[{id:'OLD_DRIVER_ID',daCode:'DRIVER_1',name:'Synthetic Courier',
  agency:'Synthetic Vendor',status:'aktiv',phone:'0000000',
  history:[{type:'status',date:'2026-10-01'}]}],
 fuelCards:[{code:'CARD_TEST'}],contacts:[{name:'Synthetic Service'}]
});
const staging=()=>({drivers:[{id:'DRIVER_1',daCode:'DRIVER_1',name:'Synthetic Courier',
 vendor:'Synthetic Vendor',active:true,capacity:100}],
 vehicles:[{id:'AAA123',plate:'AAA123',model:'Ford Transit',status:'Elérhető'}]});
const proof=()=>({
 legacyServerVersionConfirmed:true,legacyPendingLocalChangesResolved:true,
 legacyFullBackupVerified:true,stagingRestoreTestPassed:true,
 dedicatedUsersApproved:true,durableHostingReady:true,businessDataMigrationApproved:true
});
let n=0;const check=(name,fn)=>{try{fn();n++}catch(e){throw Error(name+': '+e.message,{cause:e})}};
check('master records matching is not a complete migration',()=>{
 const p=assessFleetCutover({legacy:legacy(),staging:staging(),proof:proof()});
 assert.equal(p.counts.matchedVehicles,1);assert.equal(p.counts.matchedDrivers,1);
 assert.equal(p.readiness,'blocked');
 assert.ok(p.holds.some(x=>x.category==='fuelCards'));
 assert.ok(p.holds.some(x=>x.category==='contacts'));
 assert.ok(p.holds.some(x=>x.category==='legacyActiveVehicleAssignments'));
});
check('legacy handover history remains blocking',()=>{
 const p=assessFleetCutover({legacy:legacy(),staging:staging(),proof:proof()});
 assert.equal(p.counts.legacyHistoryEvents,2);
 assert.ok(p.holds.some(x=>x.category==='vehicleHistory'));
 assert.ok(p.holds.some(x=>x.category==='driverHistory'));
});
check('vehicle insurance and mileage not silently dropped',()=>{
 const p=assessFleetCutover({legacy:legacy(),staging:staging(),proof:proof()});
 assert.ok(p.holds.some(x=>x.category==='vehicleMetadataFields'));
 assert.ok(p.counts.legacyMetadataFields>=3);
});
check('unmigrated legacy driver and car separately blocked',()=>{
 const p=assessFleetCutover({legacy:legacy(),staging:{drivers:[],vehicles:[]},proof:proof()});
 assert.equal(p.counts.newDrivers,1);assert.equal(p.counts.newVehicles,1);
 assert.ok(p.holds.some(x=>x.reason==='unmigrated_master_records'));
});
check('source conflict blocks cutover',()=>{
 const s=staging();s.drivers[0].name='Wrong';
 const p=assessFleetCutover({legacy:legacy(),staging:s,proof:proof()});
 assert.equal(p.counts.conflictingDrivers,1);
 assert.ok(p.holds.some(x=>x.reason==='master_data_conflict'));
});
check('six unknown synthetic courier statuses are source quality, not staging conflicts',()=>{
 const x={vehicles:[],fuelCards:[],contacts:[],drivers:Array.from({length:12},(_,i)=>({
  id:'SYNTHETIC_OLD_'+i,daCode:'SYNDA'+String(i).padStart(4,'0'),
  name:'Synthetic Courier '+i,agency:'QA',status:i<6?'ismeretlen':'aktiv'
 }))};
 const p=assessFleetCutover({legacy:x,staging:{drivers:[],vehicles:[]},proof:proof()});
 assert.equal(p.counts.sourceQualityBlockers,6);
 assert.equal(p.counts.unknownDriverStatuses,6);
 assert.equal(p.counts.conflictingDrivers+p.counts.conflictingVehicles,0);
 assert.equal(p.holds.find(h=>h.reason==='legacy_source_quality')?.count,6);
 assert.equal(p.holds.find(h=>h.reason==='legacy_source_quality')?.unknownDriverStatuses,6);
 assert.equal(p.holds.some(h=>h.reason==='master_data_conflict'),false);
 assert.equal(p.readiness,'blocked');assert.equal(p.writesAllowed,false);
 assert.equal(JSON.stringify(p).includes('SYNTHETIC_OLD_'),false);
});
check('unknown legacy driver status and a true destination conflict are separate',()=>{
 const x=legacy();x.drivers[0].status='ismeretlen';
 const s=staging();s.drivers[0].active=false;s.vehicles[0].model='Different test model';
 const p=assessFleetCutover({legacy:x,staging:s,proof:proof()});
 assert.equal(p.counts.unknownDriverStatuses,1);
 assert.equal(p.counts.conflictingDrivers,0);
 assert.equal(p.counts.conflictingVehicles,1);
 assert.equal(p.holds.find(h=>h.reason==='legacy_source_quality')?.count,1);
 assert.equal(p.holds.find(h=>h.reason==='master_data_conflict')?.count,1);
 assert.equal(p.readiness,'blocked');
});
check('duplicate staging IDs are not counted as same-key data conflicts',()=>{
 const s=staging();s.vehicles.push({id:'AAA-123',plate:'AAA-123',model:'Ford Transit',status:'Elérhető'});
 const p=assessFleetCutover({legacy:legacy(),staging:s,proof:proof()});
 assert.equal(p.counts.stagingIntegrityBlockers,1);
 assert.equal(p.counts.conflictingVehicles,0);
 assert.equal(p.holds.find(h=>h.reason==='staging_master_integrity')?.count,1);
 assert.equal(p.holds.some(h=>h.reason==='master_data_conflict'),false);
 assert.equal(p.readiness,'blocked');
});
check('unknown legacy vehicle status remains blocked without inventing collision',()=>{
 const x=legacy();x.vehicles[0].status='ismeretlen';
 const p=assessFleetCutover({legacy:x,staging:{drivers:[],vehicles:[]},proof:proof()});
 assert.equal(p.counts.unknownVehicleStatuses,1);
 assert.equal(p.holds.find(h=>h.reason==='legacy_source_quality')?.count,1);
 assert.equal(p.holds.some(h=>h.reason==='master_data_conflict'),false);
 assert.equal(p.readiness,'blocked');
});
check('review queue gives private JSON positions without business labels',()=>{
 const x={vehicles:[
  {id:'CAR_A',rendszam:'SYN-100',status:'aktiv',currentDriver:'SENSITIVE DRIVER LABEL'},
  {id:'CAR_B',rendszam:'SYN-200',status:'szerviz',currentDriver:'ANOTHER PRIVATE LABEL'},
  {id:'CAR_C',rendszam:'SYN-300',status:'ismeretlen',currentDriver:' sensitive   driver label '}
 ],drivers:[
  {id:'OLD_1',daCode:'TESTDA01',name:'SECRET COURIER ONE',status:'aktiv'},
  {id:'OLD_2',daCode:'TESTDA02',name:'SECRET COURIER TWO',status:'ismeretlen'},
  {id:'OLD_3',daCode:'TESTDA03',name:'SECRET COURIER THREE',status:'ismeretlen'}
 ],fuelCards:[],contacts:[]};
 const p=assessFleetCutover({legacy:x,staging:{vehicles:[],drivers:[]},proof:proof()});
 assert.deepEqual(p.reviewQueue.unknownDriverStatusPositions,[2,3]);
 assert.deepEqual(p.reviewQueue.unknownVehicleStatusPositions,[3]);
 assert.deepEqual(p.reviewQueue.vehicleUserMappingPositions,[1,2,3]);
 assert.deepEqual(p.reviewQueue.repeatedVehicleUserGroups,[[1,3]]);
 assert.equal(p.readiness,'blocked');assert.equal(p.writesAllowed,false);
 const report=JSON.stringify(p);
 for(const pii of ['SENSITIVE DRIVER LABEL','ANOTHER PRIVATE LABEL','SECRET COURIER','TESTDA01','SYN100','CAR_A'])
  assert.ok(!report.includes(pii),pii);
 assert.equal(Object.isFrozen(p.reviewQueue),true);
 assert.equal(Object.isFrozen(p.reviewQueue.repeatedVehicleUserGroups[0]),true);
});
check('review positions stay empty when source has no status or assignment holds',()=>{
 const x={vehicles:[],drivers:[],fuelCards:[],contacts:[]};
 const p=assessFleetCutover({legacy:x,staging:{vehicles:[],drivers:[]},proof:proof()});
 assert.deepEqual(p.reviewQueue.unknownDriverStatusPositions,[]);
 assert.deepEqual(p.reviewQueue.vehicleUserMappingPositions,[]);
 assert.deepEqual(p.reviewQueue.repeatedVehicleUserGroups,[]);
 assert.equal(p.readiness,'review-ready-not-approved');
});
check('pending local writes always block',()=>{
 const x=proof();x.legacyPendingLocalChangesResolved=false;
 const p=assessFleetCutover({legacy:legacy(),staging:staging(),proof:x});
 assert.ok(p.holds.some(x=>x.gate==='legacyPendingLocalChangesResolved'));
});
check('no verified Apps Script version blocks',()=>{
 const x=proof();x.legacyServerVersionConfirmed=false;
 const p=assessFleetCutover({legacy:legacy(),staging:staging(),proof:x});
 assert.ok(p.holds.some(x=>x.gate==='legacyServerVersionConfirmed'));
});
check('no durable hosting blocks cutover',()=>{
 const x=proof();x.durableHostingReady=false;
 const p=assessFleetCutover({legacy:legacy(),staging:staging(),proof:x});
 assert.ok(p.holds.some(x=>x.gate==='durableHostingReady'));
});
check('absence of backup or tested restore blocks cutover',()=>{
 const x=proof();x.legacyFullBackupVerified=false;x.stagingRestoreTestPassed=false;
 const p=assessFleetCutover({legacy:legacy(),staging:staging(),proof:x});
 assert.equal(p.holds.filter(y=>y.reason==='approval_or_backup_missing').length,2);
});
check('missing proof boolean cannot default to approval',()=>{
 const x=proof();delete x.businessDataMigrationApproved;
 assert.throws(()=>assessFleetCutover({legacy:legacy(),staging:staging(),proof:x}));
});
check('readiness only after all empty and separately approved',()=>{
 const p=assessFleetCutover({legacy:{vehicles:[],drivers:[],fuelCards:[],contacts:[]},
  staging:{drivers:[],vehicles:[]},proof:proof()});
 assert.equal(p.readiness,'review-ready-not-approved');assert.equal(p.holds.length,0);
});
check('invalid legacy group missing blocks',()=>{
 const x=legacy();delete x.fuelCards;
 assert.throws(()=>assessFleetCutover({legacy:x,staging:staging(),proof:proof()}));
});
check('no row IDs or notes in results',()=>{
 const p=assessFleetCutover({legacy:legacy(),staging:staging(),proof:proof()});
 const t=JSON.stringify(p);
 for(const id of ['DRIVER_1','OLD_CAR_ID','Synthetic Courier','CARD_TEST','AAA123'])
  assert.ok(!t.includes(id),id);
});
check('module only returns immutable top-level result and no write enable flag',()=>{
 const p=assessFleetCutover({legacy:legacy(),staging:staging(),proof:proof()});
 assert.equal(p.writesAllowed,false);assert.equal(p.personalDataIncluded,false);
 assert.equal(p.sourceOriginVerified,false);assert.equal(Object.isFrozen(p),true);
});
console.log('PASS: '+n+' cutover guards, legacy history coverage, central sync and redacted output');
