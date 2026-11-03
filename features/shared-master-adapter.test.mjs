import assert from 'node:assert/strict';
import {
  planSharedMigration,fleetVehicleToDepo,fleetDriverToDepo,
  depoVehicleWrite,depoDriverWrite,depoToFleetVehicle,depoToFleetDriver
} from './shared-master-adapter.mjs';

const snapshot={
  vehicles:[
    {id:'v1',rendszam:'ABC-123',status:'aktiv',gyartmany:'Ford',modell:'Transit',
      km:45000,history:[{type:'atadas'}],biztositasSzam:'SYNTHETIC'},
    {id:'v2',rendszam:'BCA-234',status:'szerviz',history:[{type:'szerviz'}]}
  ],
  drivers:[
    {id:'flotta-local-id',daCode:'DA001',name:'Teszt Futár',
      agency:'Minta Vállalkozó',status:'aktiv',phone:'000',history:[{type:'status'}]},
    {id:'other-internal-id',daCode:'DA002',name:'Második Futár',status:'inaktiv'}
  ],
  fuelCards:[{id:'synthetic-fuel-card',history:[{type:'card'}]}],
  contacts:[{id:'synthetic-contact'}]
};
const plan=planSharedMigration(snapshot);
assert.equal(plan.ready,true);
assert.deepEqual(plan.issues,[]);
assert.equal(plan.counts.vehicles,2);
assert.equal(plan.counts.drivers,2);
assert.equal(plan.counts.vehicleHistory,2);
assert.equal(plan.counts.driverHistory,1);
assert.equal(plan.counts.fuelCards,1);
assert.deepEqual(plan.source,snapshot);
assert.equal(plan.vehicles[0].status,'Elérhető');
assert.equal(plan.vehicles[1].status,'Szerviz');
assert.equal(plan.drivers[0].id,'DA001'); // NEVER the original local id
assert.equal(plan.drivers[0].name,'Teszt Futár');
assert.equal(plan.drivers[0].vendor,'Minta Vállalkozó');
assert.equal(plan.drivers[0].active,true);
assert.equal(plan.drivers[1].active,false);
assert.equal(plan.drivers[0].capacity,0); // no capacity was provided
assert.deepEqual(depoToFleetVehicle(plan.vehicles[0]),snapshot.vehicles[0]);
assert.deepEqual(depoToFleetDriver(plan.drivers[0]),snapshot.drivers[0]);
assert.equal(depoToFleetVehicle(plan.writes.vehicles[0].data),null); // never claim lossless restore from projection
assert.equal(depoToFleetDriver(plan.writes.drivers[0].data),null);
assert.deepEqual(Object.keys(plan.writes.vehicles[0].data).sort(),['model','plate','status']);
assert.deepEqual(Object.keys(plan.writes.drivers[0].data).sort(),
  ['active','capacity','daCode','name','vendor']);
assert.equal(plan.writes.vehicles[0].id,'ABC123');
assert.equal(plan.writes.drivers[0].id,'DA001');

const modified=fleetVehicleToDepo(snapshot.vehicles[0]);
modified.flotta.km=1;
assert.equal(snapshot.vehicles[0].km,45000); // no side effects
assert.equal(fleetDriverToDepo({...snapshot.drivers[0],daCode:''}),null); // refuse fallback to local id
assert.equal(depoVehicleWrite({...modified,id:'wrong'}),null);
assert.equal(depoDriverWrite({...plan.drivers[0],capacity:100000}),null);
const duplicate=planSharedMigration({
  ...snapshot,vehicles:[snapshot.vehicles[0],{...snapshot.vehicles[0],id:'v3',rendszam:'ABC123'}]
});
assert.equal(duplicate.ready,false);
assert.ok(duplicate.issues.some(i=>i.reason==='duplicate normalized plate'));
const unknownDA=planSharedMigration({
  ...snapshot,drivers:[{...snapshot.drivers[0],daCode:''}]
});
assert.equal(unknownDA.ready,false);
assert.equal(unknownDA.counts.drivers,0);
const unknownStatus=planSharedMigration({
  ...snapshot,drivers:[{...snapshot.drivers[0],status:'ismeretlen'}]
});
assert.equal(unknownStatus.ready,false);
assert.equal(unknownStatus.drivers[0].active,false);
assert.throws(()=>planSharedMigration({vehicles:[],drivers:[]}),/four arrays required/);
console.log('shared-master canonical, identity, lossless and schema tests passed');
