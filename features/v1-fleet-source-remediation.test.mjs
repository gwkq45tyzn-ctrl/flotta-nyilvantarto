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


test('a business-valid source with forged privileged index is not migration-ready',()=>{
  const original=legacyWithMissingFields(),patch=patches(original);
  original.drivers[0].sourceIndex=0;
  const report=auditFleetSourceForImport(original);
  assert.equal(report.sourcePreflightReady,false);
  assert.equal(report.ready,false);
  assert.ok(report.issues.some(i=>i.reason==='RAW_MIGRATION_PREFLIGHT_DENIED'));
  assert.throws(()=>buildExplicitFleetRemediationCandidate({
    original,expectedOriginalSha256:sha256(original),changes:patch
  }),/CANDIDATE_NOT_IMPORT_READY/);
});

test('duplicated original rich record IDs cannot be hidden by otherwise valid DA codes',()=>{
  const original=legacyWithMissingFields(),patch=patches(original);
  original.drivers[1].id=original.drivers[0].id;
  const report=auditFleetSourceForImport(original);
  assert.equal(report.sourcePreflightReady,false);
  assert.equal(report.ready,false);
  assert.throws(()=>buildExplicitFleetRemediationCandidate({
    original,expectedOriginalSha256:sha256(original),changes:patch
  }),/CANDIDATE_NOT_IMPORT_READY/);
});

test('invalid legacy history shape cannot be silently migrated',()=>{
  const original=legacyWithMissingFields(),patch=patches(original);
  original.vehicles[2].history={unexpected:true};
  const report=auditFleetSourceForImport(original);
  assert.equal(report.sourcePreflightReady,false);
  assert.equal(report.ready,false);
  assert.throws(()=>buildExplicitFleetRemediationCandidate({
    original,expectedOriginalSha256:sha256(original),changes:patch
  }),/CANDIDATE_NOT_IMPORT_READY/);
});

test('offline candidate uses the same driver window and atomic read budget as the pinned importer',()=>{
  for(const [drivers,vehicles,window,reason] of [
    [21,14,true,null],[30,26,true,null],[31,14,false,'PHASE1_RULES_DRIVER_LIMIT_EXCEEDED'],
    [30,27,true,'PHASE1_ATOMIC_MIGRATION_READ_BOUND_EXCEEDED']
  ]){
    const original=syntheticFourBlockSource({drivers,vehicles,fuelCards:2,contacts:1});
    const audit=auditFleetSourceForImport(original);
    assert.equal(audit.bookingWindowReady,window);
    assert.equal(audit.ready,reason===null);
    if(reason)assert.ok(audit.issues.some(issue=>issue.reason===reason));
    assert.equal(audit.authorizedForImport,false);
  }
});

test('malformed capacity needs an explicit identity-bound repair; original rich history survives',()=>{
  const original=syntheticFourBlockSource({drivers:1,vehicles:1,fuelCards:1,contacts:1});
  original.drivers[0].kapacitas=[70];
  original.drivers[0].capacity=70;
  const audit=auditFleetSourceForImport(original);
  assert.deepEqual(audit.missingCapacityIndices,[0]);
  assert.equal(audit.ready,false);
  const fixed=buildExplicitFleetRemediationCandidate({
    original,expectedOriginalSha256:sha256(original),
    changes:[{index:0,expectedDaCode:original.drivers[0].daCode,capacity:63}]
  });
  assert.equal(fixed.candidate.drivers[0].kapacitas,63);
  assert.deepEqual(original.drivers[0].kapacitas,[70]);
  assert.deepEqual(fixed.candidate.drivers[0].history,original.drivers[0].history);
});

test('canonical preflight budget failure cannot be mislabeled as ready',()=>{
  const original=legacyWithMissingFields(),patch=patches(original);
  original.contacts[0].history[0].text='x'.repeat(850000);
  const report=auditFleetSourceForImport(original);
  assert.equal(report.sourcePreflightReady,false);
  assert.equal(report.ready,false);
  assert.throws(()=>buildExplicitFleetRemediationCandidate({
    original,expectedOriginalSha256:sha256(original),changes:patch
  }),/CANDIDATE_NOT_IMPORT_READY/);
});
