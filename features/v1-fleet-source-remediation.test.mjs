import test from 'node:test';
import assert from 'node:assert/strict';
import {sha256} from '../tools/v1-migration-dryrun.mjs';
import {syntheticFourBlockSource,projectBlockPairs} from '../tools/v1-variable-block-migration.mjs';
import {
  auditFleetSourceForImport,buildExplicitFleetRemediationCandidate
} from './v1-fleet-source-remediation.mjs';

const counts={drivers:12,vehicles:14,fuelCards:14,contacts:5};
function legacyWithMissingFields(){
  const source=syntheticFourBlockSource(counts);
  source.extra={future:{nested:{preserve:true}},version:'synthetic'};
  for(const d of source.drivers)delete d.kapacitas;
  for(const i of [0,3,9])source.drivers[i].status='ismeretlen';
  return source;
}
function patches(source){
  return source.drivers.map((d,index)=>({
    index,expectedDaCode:d.daCode,capacity:70,
    ...([0,3,9].includes(index)?{status:'inaktiv'}:{})
  }));
}

test('read-only audit catches all missing real-like capacities and unknown statuses',()=>{
  const source=legacyWithMissingFields(),original=structuredClone(source);
  const result=auditFleetSourceForImport(source);
  assert.deepEqual(result.counts,counts);
  assert.equal(result.ready,false);
  assert.equal(result.missingCapacityIndices.length,12);
  assert.deepEqual(result.unknownStatusIndices,[0,3,9]);
  assert.equal(result.originalSha256,sha256(source));
  assert.equal(result.authorizedForImport,false);
  assert.equal(result.productionIamVerified,false);
  assert.deepEqual(source,original);
});

test('explicit full offline remediation keeps all rich four arrays and immutable original',()=>{
  const source=legacyWithMissingFields(),original=structuredClone(source);
  const expectedOriginalSha256=sha256(source);
  const result=buildExplicitFleetRemediationCandidate({
    original:source,expectedOriginalSha256,changes:patches(source)
  });
  assert.equal(result.authorizedForImport,false);
  assert.equal(result.ownerApprovalAuthenticated,false);
  assert.equal(result.productionSealAllowed,false);
  assert.equal(result.originalSha256,expectedOriginalSha256);
  assert.notEqual(result.candidateSha256,expectedOriginalSha256);
  assert.equal(result.applied.length,12);
  assert.equal(auditFleetSourceForImport(result.candidate).ready,true);
  assert.deepEqual(result.candidate.vehicles,source.vehicles);
  assert.deepEqual(result.candidate.fuelCards,source.fuelCards);
  assert.deepEqual(result.candidate.contacts,source.contacts);
  assert.deepEqual(result.candidate.extra,source.extra);
  for(const [index,d] of result.candidate.drivers.entries()){
    assert.equal(d.kapacitas,70);
    assert.deepEqual(d.history,source.drivers[index].history);
    assert.equal(d.id,source.drivers[index].id);
    assert.equal(d.daCode,source.drivers[index].daCode);
    if([0,3,9].includes(index))assert.equal(d.status,'inaktiv');
  }
  const projected=projectBlockPairs(result.candidate);
  assert.equal(projected.pairs.length,26);
  assert.equal(projected.authorizedForImport,false);
  assert.equal(projected.firestoreEncodedSizeVerified,false);
  assert.deepEqual(source,original);
});

test('partial patches, wrong source SHA and index/DA swap always refuse a candidate',()=>{
  const source=legacyWithMissingFields(),digest=sha256(source);
  const params=changes=>({original:source,expectedOriginalSha256:digest,changes});
  assert.throws(()=>buildExplicitFleetRemediationCandidate({
    ...params(patches(source)),expectedOriginalSha256:'0'.repeat(64)
  }),/ORIGINAL_SOURCE_SHA_MISMATCH/);
  assert.throws(()=>buildExplicitFleetRemediationCandidate(params(patches(source).slice(0,11))),
    /CANDIDATE_NOT_IMPORT_READY/);
  const swapped=patches(source);
  swapped[1]={...swapped[1],expectedDaCode:'DA9999'};
  assert.throws(()=>buildExplicitFleetRemediationCandidate(params(swapped)),
    /DRIVER_IDENTITY_OR_INDEX_MISMATCH/);
  const duplicate=patches(source);
  duplicate[1]={...duplicate[1],index:0};
  assert.throws(()=>buildExplicitFleetRemediationCandidate(params(duplicate)),
    /DUPLICATE_DRIVER_PATCH/);
});

test('no inferred capacity, activated unknown status or overwrite of existing capacity',()=>{
  const source=legacyWithMissingFields(),digest=sha256(source);
  const params=changes=>({original:source,expectedOriginalSha256:digest,changes});
  const active=patches(source);
  active[0]={...active[0],status:'aktiv'};
  assert.throws(()=>buildExplicitFleetRemediationCandidate(params(active)),
    /UNVERIFIED_DRIVER_MUST_REMAIN_INACTIVE/);
  const invalid=patches(source);
  invalid[1]={...invalid[1],capacity:70.5};
  assert.throws(()=>buildExplicitFleetRemediationCandidate(params(invalid)),
    /INVALID_EXPLICIT_CAPACITY/);
  assert.throws(()=>buildExplicitFleetRemediationCandidate(params([])),
    /EXPLICIT_DRIVER_PATCHES_REQUIRED/);
  source.drivers[0].kapacitas=80;
  const changed=patches(source);
  assert.throws(()=>buildExplicitFleetRemediationCandidate({
    original:source,expectedOriginalSha256:sha256(source),changes:changed
  }),/EXISTING_CAPACITY_IMMUTABLE/);
});

test('must have complete four-block source with original identity preserved',()=>{
  const source=legacyWithMissingFields();
  delete source.contacts;
  assert.throws(()=>auditFleetSourceForImport(source),/INCOMPLETE_FOUR_BLOCK_SOURCE/);
  assert.throws(()=>buildExplicitFleetRemediationCandidate({
    original:source,expectedOriginalSha256:'0'.repeat(64),changes:[]
  }),/INCOMPLETE_FOUR_BLOCK_SOURCE/);
});
