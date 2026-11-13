import test from 'node:test';
import assert from 'node:assert/strict';
import {validateBackup} from './v1-readonly-backup-validation.mjs';

const good=()=>({
 drivers:[{id:'internal-d1',daCode:'DA0001',name:'TEST PRIVATE DRIVER',kapacitas:80,status:'aktiv',history:[{kind:'hire'}]}],
 vehicles:[{id:'internal-v1',rendszam:'ABC-123',status:'aktiv',history:[]}],
 fuelCards:[],contacts:[]
});

test('original full four-array backup validates with rich SHA but never seals',()=>{
 const result=validateBackup(good());
 assert.equal(result.ok,true);
 assert.equal(result.operationalReady,true);
 assert.equal(result.driverCount,1);
 assert.equal(result.vehicleCount,1);
 assert.match(result.sourceSha256,/^[0-9a-f]{64}$/);
 assert.equal(result.sealed,false);
 assert.equal(result.canSeal,false);
 assert.equal(result.authorizedForImport,false);
});
test('normalization catches case/space/hyphen equivalent DA and plate collisions',()=>{
 const x=good();
 x.drivers.push({...x.drivers[0],id:'internal-d2',daCode:'da0001'});
 x.vehicles.push({...x.vehicles[0],id:'internal-v2',rendszam:'abc123'});
 const report=validateBackup(x);
 assert.equal(report.ok,false);
 assert.ok(report.issues.includes('DUPLICATE_DRIVER'));
 assert.ok(report.issues.includes('DUPLICATE_VEHICLE'));
 assert.doesNotMatch(JSON.stringify(report),/ABC-123|da0001|internal-d2/);
});
test('missing optional rich history does not invalidate existing original Fleet rows',()=>{
 const x=good();delete x.drivers[0].history;delete x.vehicles[0].history;
 const report=validateBackup(x);
 assert.equal(report.ok,true);
 assert.equal(report.warnings.driversWithoutHistory,1);
 assert.equal(report.warnings.vehiclesWithoutHistory,1);
 const broken=good();broken.drivers[0].history={not:'array'};
 const rejected=validateBackup(broken);
 assert.equal(rejected.ok,false);
 assert.ok(rejected.issues.includes('INVALID_HISTORY'));
});
test('untrusted reserved original sourceIndex and duplicate internal ID denied',()=>{
 const x=good();x.drivers[0].sourceIndex=0;
 assert.equal(validateBackup(x).ok,false);
 const y=good();y.drivers.push({...y.drivers[0],daCode:'DA0002'});
 assert.equal(validateBackup(y).ok,false);
});
test('synthetic real-shape 12 drivers, 14 vehicles, 14 fuel and 5 contacts detects missing capacity / unknown statuses without PII',()=>{
 const x={
  drivers:Array.from({length:12},(_,i)=>({id:'secret-driver-'+i,daCode:'DA'+String(i+1).padStart(4,'0'),name:'PRIVATE PERSON '+i,status:i<3?'ismeretlen':'aktiv',history:i%4===0?[]:undefined})),
  vehicles:Array.from({length:14},(_,i)=>({id:'secret-car-'+i,rendszam:'TEST'+String(i+1).padStart(4,'0'),status:'aktiv',history:i%3===0?[]:undefined})),
  fuelCards:Array.from({length:14},(_,i)=>({id:'secret-fuel-'+i})),
  contacts:Array.from({length:5},(_,i)=>({id:'secret-contact-'+i}))
 };
 // Never serialize undefined as explicit history: model the original omitted field.
 x.drivers.forEach(d=>{if(d.history===undefined)delete d.history});
 x.vehicles.forEach(v=>{if(v.history===undefined)delete v.history});
 const before=JSON.stringify(x),result=validateBackup(x);
 assert.equal(JSON.stringify(x),before,'read-only validation must not mutate');
 assert.equal(result.ok,true);
 assert.equal(result.operationalReady,false);
 assert.deepEqual([result.driverCount,result.vehicleCount,result.fuelCardCount,result.contactCount],[12,14,14,5]);
 assert.equal(result.warnings.driversMissingOrInvalidDailyCapacity,12);
 assert.equal(result.warnings.driversWithUnknownStatus,3);
 assert.equal(result.warnings.vehiclesWithUnknownStatus,0);
 for(const secret of ['secret-driver','secret-car','secret-fuel','PRIVATE PERSON'])
  assert.equal(JSON.stringify(result).includes(secret),false,secret);
});
test('explicit zero is distinguishable from absent or non-integer capacity',()=>{
 const x=good();
 x.drivers[0].kapacitas=0;
 assert.equal(validateBackup(x).operationalReady,true);
 delete x.drivers[0].kapacitas;
 assert.equal(validateBackup(x).operationalReady,false);
 x.drivers[0].kapacitas=2.4;
 assert.equal(validateBackup(x).warnings.driversMissingOrInvalidDailyCapacity,1);
});
test('no fixed source size and required 4 arrays',()=>{
 const x=good();x.drivers=Array.from({length:120},(_,i)=>({id:'d'+i,daCode:'DA'+String(i).padStart(4,'0'),name:'Synthetic',status:'aktiv',kapacitas:80}));
 assert.equal(validateBackup(x).driverCount,120);
 assert.equal(validateBackup(x).ok,true);
 delete x.fuelCards;
 assert.equal(validateBackup(x).ok,false);
 assert.ok(validateBackup(x).issues.includes('MISSING_OR_INVALID_BLOCK'));
});
