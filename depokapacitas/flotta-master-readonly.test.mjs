import assert from 'node:assert/strict';
import {emptySharedFleetPreview,projectSharedFleetSnapshot} from './flotta-master-readonly.mjs';
const fixture=()=>({
  revision:2,
  vehicles:[{id:'internal-car',rendszam:'ABC-123',status:'aktiv',gyartmany:'Ford',
    modell:'Transit',km:1234,history:[{type:'service'}]}],
  drivers:[{id:'legacy-generated',daCode:'DA001',name:'Teszt Futár',
    agency:'Minta Kft',status:'aktiv',phone:'000',history:[{type:'status'}]}],
  fuelCards:[{id:'private-card'}],contacts:[{id:'private-contact'}]
});
const verified=projectSharedFleetSnapshot(fixture(),{fromCache:false,hasPendingWrites:false});
assert.equal(verified.status,'preview');
assert.equal(verified.revision,2);
assert.equal(verified.vehicles[0].id,'ABC123');
assert.deepEqual(verified.vehicles[0].data,{plate:'ABC123',model:'Ford Transit',status:'Elérhető'});
assert.equal(verified.drivers[0].id,'DA001');
assert.deepEqual(verified.drivers[0].data,{
  name:'Teszt Futár',daCode:'DA001',vendor:'Minta Kft',capacity:0,active:true
});
assert.equal(verified.counts.fuelCards,1);
assert.equal(verified.counts.vehicleHistory,1);
assert.equal('source' in verified,false);
assert.equal('flotta' in verified.vehicles[0].data,false);
assert.equal(JSON.stringify(verified).includes('000'),false,
  'Private phone number should not appear in the read-only projection');
for(const metadata of [{fromCache:true,hasPendingWrites:false},{fromCache:false,hasPendingWrites:true}]){
 const preview=projectSharedFleetSnapshot(fixture(),metadata);
 assert.equal(preview.status,'unconfirmed');
 assert.equal(preview.drivers.length,0);
}
const missing=projectSharedFleetSnapshot(null,{fromCache:false,hasPendingWrites:false});
assert.equal(missing.status,'missing');
assert.deepEqual(missing.vehicles,[]);
const invalid=projectSharedFleetSnapshot({...fixture(),revision:0},{fromCache:false,hasPendingWrites:false});
assert.equal(invalid.status,'invalid');
const duplicate=projectSharedFleetSnapshot({...fixture(),
 drivers:[fixture().drivers[0],{...fixture().drivers[0],id:'other'}]},
 {fromCache:false,hasPendingWrites:false});
assert.equal(duplicate.status,'review');
assert.ok(duplicate.issues.some(i=>i.reason==='duplicate normalized DA code'));
assert.equal(emptySharedFleetPreview().status,'waiting');
console.log('PASS: original Fleet shared master is preview-only, redacted and server-confirmed');
