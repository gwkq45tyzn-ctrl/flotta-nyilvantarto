import assert from 'node:assert/strict';
import test from 'node:test';
import {prepareReviewedCourierCapacities as prepare}
  from './v1-capacity-remediation.mjs';
import {sha256} from './v1-migration-dryrun.mjs';

const source=()=>({
  drivers:[
    {id:'driver-1',daCode:'DA-0001',status:'aktiv',history:[{note:'PRIVATE RICH RETAIN'}]},
    {id:'driver-2',daCode:'DA-0002',status:'aktív',kapacitas:60,history:[{deep:{x:1}}]},
    {id:'driver-3',daCode:'DA-0003',status:'inaktiv'},
    {id:'driver-4',daCode:'DA-0004',status:'ismeretlen'}
  ],
  vehicles:[{id:'vehicle-1',rendszam:'ABC-123',status:'aktiv',history:[{kind:'service'}]}],
  fuelCards:[{id:'fuel-1',history:[{n:2}]}],
  contacts:[{id:'contact-1',details:{unknown:'unchanged'}}],
  futureRoot:{mustPersist:['anything']}
});
test('explicit owner-reviewed capacity fixes one active courier without altering original rich arrays',()=>{
  const raw=source(),before=sha256(raw);
  const res=prepare(raw,[{daCode:' da-0001 ',kapacitas:70,reviewed:true}]);
  assert.equal(res.ok,true,JSON.stringify(res));
  assert.equal(res.candidate.drivers[0].kapacitas,70);
  assert.equal(res.candidate.drivers[1].kapacitas,60);
  assert.equal(res.candidate.drivers[2].kapacitas,undefined);
  assert.equal(res.candidate.drivers[3].kapacitas,undefined);
  assert.deepEqual(res.candidate.vehicles,raw.vehicles);
  assert.deepEqual(res.candidate.fuelCards,raw.fuelCards);
  assert.deepEqual(res.candidate.contacts,raw.contacts);
  assert.deepEqual(res.candidate.futureRoot,raw.futureRoot);
  assert.deepEqual(res.candidate.drivers[0].history,raw.drivers[0].history);
  assert.equal(raw.drivers[0].kapacitas,undefined,'Raw source must be immutable');
  assert.equal(sha256(raw),before);
  assert.notEqual(res.candidateSourceSha256,before);
  assert.equal(res.sourceMustBeIndependentlyRebackedUp,true);
  assert.equal(res.authorizedForImport,false);
  assert.equal(res.ownerApprovalVerified,false);
  assert.equal(res.firestoreEncodedSizeVerified,false);
});
test('no implicit 70/80 default; missing active review fails closed before any changed snapshot',()=>{
  for(const decisions of [[],null,undefined]){
    const result=prepare(source(),decisions);
    assert.equal(result.ok,false);
    assert.equal('candidate' in result,false);
  }
  assert.equal(prepare(source(),[]).reason,'MISSING_ACTIVE_COURIER_REVIEW');
});
test('no arbitrary, duplicate, unreviewed, inactive or numerically invalid approvals',()=>{
  const invalid=[
    [{daCode:'DA-0001',kapacitas:70,reviewed:false}],
    [{daCode:'DA-0001',kapacitas:'70',reviewed:true}],
    [{daCode:'DA-0001',kapacitas:0,reviewed:true}],
    [{daCode:'DA-0001',kapacitas:70,reviewed:true,unsafe:true}],
    [Object.create({daCode:'DA-0001',kapacitas:70,reviewed:true})],
    [{daCode:'DA-9999',kapacitas:70,reviewed:true}],
    [{daCode:'DA-0003',kapacitas:70,reviewed:true}],
    [{daCode:'DA-0001',kapacitas:70,reviewed:true},
      {daCode:' da-0001 ',kapacitas:70,reviewed:true}]
  ];
  for(const d of invalid){
    const res=prepare(source(),d);
    assert.equal(res.ok,false,JSON.stringify(d));
    assert.equal(res.authorizedForImport,false);
    assert.equal('candidate' in res,false);
  }
});
test('25-driver source window stays enforced, review does not override canonical Rules',()=>{
  const raw=source();
  for(let i=4;i<26;i++)raw.drivers.push({id:'driver-extra-'+i,
    daCode:'DA'+String(i).padStart(4,'0'),status:'inaktiv'});
  const res=prepare(raw,[{daCode:'DA-0001',kapacitas:70,reviewed:true}]);
  assert.equal(res.reason,'OPERATIONAL_READINESS_STILL_BLOCKED');
  assert.equal(res.authorizedForImport,false);
});
test('already approved capacity may be explicitly revised but cannot cause seal or approval',()=>{
  const raw=source();raw.drivers[0].kapacitas=80;
  const res=prepare(raw,[{daCode:'DA-0001',kapacitas:70,reviewed:true}]);
  assert.equal(res.ok,true);
  assert.equal(res.candidate.drivers[0].kapacitas,70);
  assert.equal(res.candidate.drivers[1].kapacitas,60);
  assert.equal(res.previewOnly,true);
  assert.equal(res.productionIamVerified,false);
});

test('already sealed or migrated source cannot be altered by offline capacity preparation',()=>{
  const sealed=source();sealed.sealed=true;
  assert.equal(prepare(sealed,[{daCode:'DA-0001',kapacitas:70,reviewed:true}]).reason,
    'SEALED_OR_ALREADY_MIGRATED_SOURCE_NOT_EDITABLE');
  const imported=source();imported.migrationSourceSha256='a'.repeat(64);
  assert.equal(prepare(imported,[{daCode:'DA-0001',kapacitas:70,reviewed:true}]).reason,
    'SEALED_OR_ALREADY_MIGRATED_SOURCE_NOT_EDITABLE');
});
