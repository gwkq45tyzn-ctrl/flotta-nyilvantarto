import test from 'node:test';
import assert from 'node:assert/strict';
import {assessAppsScriptCutoverEvidence as assess,CUTOVER_SCHEMA}
  from './v1-apps-script-cutover-evidence.mjs';

const fixture=()=>({
  schemaVersion:CUTOVER_SCHEMA,
  capturedAt:new Date().toISOString(),
  ownerDeclaredComplete:true,
  coverage:{
    scriptProjects:true,deployedWebApps:true,staleBrowserClients:true,
    installedTriggers:true,timeDrivenTriggers:true,sheetDestinations:true,
    firebaseDestinations:true,urlFetchWriters:true
  },
  sourceSha256:'a'.repeat(64),
  principals:[{ref:'owner-reviewed-1',identityReviewed:true}],
  destinations:[{ref:'fleet-sheet-1',kind:'sheet',writeTargetReviewed:true}],
  projects:[{
    ref:'SCRIPT_PRIVATE_CANARY',
    ownerPrincipalRef:'owner-reviewed-1',
    deployments:[{
      ref:'PRIVATE_DEPLOYMENT_CANARY',enabled:false,mayWriteFleet:true,
      principalRef:'owner-reviewed-1',destinationRefs:['fleet-sheet-1'],
      versionReviewed:true
    }],
    triggers:[{
      ref:'PRIVATE_TRIGGER_CANARY',kind:'time-driven',enabled:false,
      mayWriteFleet:true,principalRef:'owner-reviewed-1',
      destinationRefs:['fleet-sheet-1']
    }],
    declaredNoDeployments:false,declaredNoTriggers:false
  }]
});
const check=(patch)=>assess(patch(fixture()));
const deny=(v,code)=>{
  const r=assess(v);
  assert.equal(r.locallyComplete,false,JSON.stringify(r));
  assert.ok(r.reasons.includes(code),JSON.stringify(r));
  assert.equal(r.productionCutoverAuthorized,false);
  assert.equal(r.ownerEvidenceAuthenticated,false);
  assert.equal(r.liveDeploymentVerified,false);
  assert.equal(r.authorizedForImport,false);
  return r;
};

test('fully reviewed sanitized SELF-CLAIM is local completeness ONLY, never true deploy evidence',()=>{
  const f=fixture();
  const r=assess(f);
  assert.deepEqual(r.reasons,[]);
  assert.equal(r.locallyComplete,true);
  assert.equal(r.noActiveFleetWriterClaimed,true);
  assert.equal(r.counts.projects,1);
  assert.equal(r.counts.deployments,1);
  assert.equal(r.counts.triggers,1);
  assert.equal(r.ownerEvidenceAuthenticated,false);
  assert.equal(r.liveDeploymentVerified,false);
  assert.equal(r.productionCutoverAuthorized,false);
  assert.equal(r.authorizedForImport,false);
  assert.equal(r.readOnly,true);
  assert.equal(JSON.stringify(r).includes('PRIVATE_CANARY'),false);
  assert.equal(JSON.stringify(r).includes('fleet-sheet-1'),false);
  assert.equal(JSON.stringify(f),JSON.stringify(fixture()).replace(
    fixture().capturedAt,f.capturedAt)); // no mutation (timestamp excepted)
});
test('missing or owner-unreviewed inventory hardstops; empty list is not evidence',()=>{
  deny(null,'MANIFEST_MISSING_OR_INVALID');
  const f=fixture();f.ownerDeclaredComplete=false;
  deny(f,'OWNER_COMPLETENESS_UNCONFIRMED');
  const zero=fixture();zero.projects=[];
  deny(zero,'SCRIPT_PROJECT_INVENTORY_MISSING');
  const noPrincipal=fixture();noPrincipal.principals=[];
  deny(noPrincipal,'EXECUTION_PRINCIPAL_INVENTORY_MISSING');
  const noDestination=fixture();noDestination.destinations=[];
  deny(noDestination,'WRITE_DESTINATION_INVENTORY_MISSING');
  const missingCoverage=fixture();missingCoverage.coverage.staleBrowserClients=false;
  deny(missingCoverage,'LEGACY_WRITER_SURFACES_NOT_ALL_REVIEWED');
  const omitted=fixture();delete omitted.coverage.firebaseDestinations;
  deny(omitted,'LEGACY_WRITER_SURFACES_NOT_ALL_REVIEWED');
});
test('active deployment or trigger that may write Fleet DENY, even with owner all-clear',()=>{
  const active=fixture();active.projects[0].deployments[0].enabled=true;
  const r=deny(active,'ACTIVE_LEGACY_FLEET_WRITER');
  assert.equal(r.counts.activeFleetWriters,1);
  const trigger=fixture();trigger.projects[0].triggers[0].enabled=true;
  deny(trigger,'ACTIVE_LEGACY_FLEET_WRITER');
});
test('unknown state, principal, write target or deployment version always DENY',()=>{
  const status=fixture();status.projects[0].deployments[0].enabled='UNKNOWN';
  deny(status,'UNKNOWN_DEPLOYMENT_STATUS');
  const mayWrite=fixture();mayWrite.projects[0].triggers[0].mayWriteFleet='UNKNOWN';
  deny(mayWrite,'UNKNOWN_TRIGGER_STATUS');
  const unknownPrincipal=fixture();
  unknownPrincipal.projects[0].deployments[0].principalRef='SECRET_EXECUTOR_CANARY';
  const r=deny(unknownPrincipal,'UNKNOWN_EXECUTION_PRINCIPAL');
  assert.doesNotMatch(JSON.stringify(r),/SECRET_EXECUTOR_CANARY/);
  const unknownTarget=fixture();
  unknownTarget.projects[0].triggers[0].destinationRefs=['SECRET_TARGET_CANARY'];
  deny(unknownTarget,'UNKNOWN_WRITE_DESTINATION');
  const version=fixture();version.projects[0].deployments[0].versionReviewed=false;
  deny(version,'UNREVIEWED_DEPLOYMENT_VERSION');
});
test('uninspected trigger or deployed versions are not waived by empty arrays',()=>{
  const t=fixture();t.projects[0].triggers=[];t.projects[0].declaredNoTriggers=false;
  deny(t,'UNVERIFIED_EMPTY_TRIGGER_INVENTORY');
  const d=fixture();d.projects[0].deployments=[];d.projects[0].declaredNoDeployments=false;
  deny(d,'UNVERIFIED_EMPTY_DEPLOYMENT_INVENTORY');
  const clean=fixture();
  clean.projects[0].triggers=[];clean.projects[0].declaredNoTriggers=true;
  assert.equal(assess(clean).locallyComplete,true);
  assert.equal(assess(clean).liveDeploymentVerified,false);
});
test('stale/future timestamps and invalid or forged source digest do not become verified',()=>{
  const stale=fixture();stale.capturedAt='2020-01-01T00:00:00.000Z';
  deny(stale,'OWNER_SNAPSHOT_STALE_OR_INVALID');
  const future=fixture();future.capturedAt='2100-01-01T00:00:00.000Z';
  deny(future,'OWNER_SNAPSHOT_STALE_OR_INVALID');
  const sha=fixture();sha.sourceSha256='owner-trust-me';
  deny(sha,'UNPINNED_SOURCE_FINGERPRINT');
  const ver=fixture();ver.schemaVersion='future';
  deny(ver,'UNSUPPORTED_MANIFEST_VERSION');
});
test('duplicate refs and dangerous unrecognized secret fields cannot pass',()=>{
  const duplicate=fixture();
  duplicate.projects[0].triggers[0].ref=duplicate.projects[0].deployments[0].ref;
  deny(duplicate,'DUPLICATE_EVIDENCE_REFERENCE');
  const secret=fixture();
  secret.projects[0].deployments[0].webappUrl='SECRET_URL_CANARY';
  const v=deny(secret,'INVALID_DEPLOYMENT_EVIDENCE');
  assert.doesNotMatch(JSON.stringify(v),/SECRET_URL_CANARY/);
  const extra=fixture();extra.productionCutoverAuthorized=true;
  deny(extra,'MANIFEST_FIELDS_MISSING_OR_UNEXPECTED');
});
test('read-only enabled deployment may be locally complete but never actual owner GO',()=>{
  const readOnly=fixture();
  readOnly.projects[0].deployments[0].enabled=true;
  readOnly.projects[0].deployments[0].mayWriteFleet=false;
  assert.equal(assess(readOnly).locallyComplete,true);
  assert.equal(assess(readOnly).productionCutoverAuthorized,false);
});
test('malformed JSON-shaped objects never crash or expose private metadata',()=>{
  const bad=fixture();bad.projects[0].deployments[0].destinationRefs={bogus:'PRIVATE_CANARY'};
  const v=deny(bad,'UNKNOWN_WRITE_DESTINATION');
  assert.doesNotMatch(JSON.stringify(v),/PRIVATE_CANARY/);
  const hacked=JSON.parse(JSON.stringify(fixture()));
  hacked.projects[0].deployments[0].__proto__={weOwnYou:true};
  // inherited keys are either strict own field sets or object prototype guards.
  assert.equal(assess(hacked).productionCutoverAuthorized,false);
});
