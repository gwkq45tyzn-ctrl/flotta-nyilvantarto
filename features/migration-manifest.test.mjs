import assert from 'node:assert/strict';
import {canonicalStringify,createMigrationManifest} from './migration-manifest.mjs';
const snapshot={
  vehicles:[{id:'v1',rendszam:'ABC-123',status:'aktiv',
    history:[{type:'sérülés',km:10234}]}],
  drivers:[{id:'internal',daCode:'DA001',name:'Teszt',history:[]}],
  fuelCards:[{id:'card1'}],contacts:[{id:'contact1'}]
};
const clone=x=>JSON.parse(JSON.stringify(x));
const original=createMigrationManifest(snapshot);
assert.equal(original.sourceHash.length,64);
assert.equal(original.counts.vehicleHistory,1);
assert.equal(original.counts.drivers,1);
assert.equal(original.authorizedForImport,false);
assert.equal(original.requiresFirestoreEncodedSizeCheck,true);
assert.equal(original.withinConservativeJsonBudget,true);
assert.deepEqual(createMigrationManifest(clone(snapshot)),original);
const reorder={
  contacts:clone(snapshot.contacts),drivers:clone(snapshot.drivers),
  fuelCards:clone(snapshot.fuelCards),vehicles:[{
    history:[{km:10234,type:'sérülés'}],status:'aktiv',rendszam:'ABC-123',id:'v1'
  }]
};
assert.equal(createMigrationManifest(reorder).sourceHash,original.sourceHash,
  'Nested object property insertion order should not change canonical hash');
const variants=[
  (()=>{const x=clone(snapshot);x.drivers[0].daCode='DA002';return x;})(),
  (()=>{const x=clone(snapshot);x.vehicles[0].history[0].km=999999;return x;})(),
  (()=>{const x=clone(snapshot);x.vehicles[0].status='szerviz';return x;})(),
  (()=>{const x=clone(snapshot);x.fuelCards[0].id='changed';return x;})(),
  (()=>{const x=clone(snapshot);x.contacts.push({id:'second'});return x;})()
];
for(const [i,x] of variants.entries())
  assert.notEqual(createMigrationManifest(x).sourceHash,original.sourceHash,
    'Different nested Fleet data MUST change the hash (case '+i+')');
const unicode=canonicalStringify({accent:'ő'});
assert.ok(Buffer.byteLength(unicode,'utf8')>unicode.length,
  'UTF-8 must account for multibyte characters');
const over=createMigrationManifest({...clone(snapshot),vehicles:[
  {...snapshot.vehicles[0],note:'x'.repeat(850000)}
]});
assert.equal(over.withinConservativeJsonBudget,false);
assert.equal(over.status,'oversize-risk');
assert.equal(over.authorizedForImport,false);
assert.throws(()=>createMigrationManifest({vehicles:[],drivers:[]}),/must contain/);
assert.throws(()=>canonicalStringify({a:undefined}),/Non-JSON value/);
assert.throws(()=>canonicalStringify({a:NaN}),/Non-finite/);
const cyclic={};cyclic.self=cyclic;
assert.throws(()=>canonicalStringify(cyclic),/Cyclic/);
console.log('PASS: nested SHA-256, parity counts, key ordering and conservative size gate');
