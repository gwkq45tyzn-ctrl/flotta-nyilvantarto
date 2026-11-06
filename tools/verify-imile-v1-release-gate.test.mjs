import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {AUDIT_GATES,evaluateReleaseApproval} from './verify-imile-v1-release-gate.mjs';

const fixture=JSON.parse(fs.readFileSync(
  new URL('../docs/IMILE_V1_RELEASE_APPROVAL_TEMPLATE.json',import.meta.url),'utf8'
));
const copy=x=>JSON.parse(JSON.stringify(x));
const repo='https://github.com/gwkq45tyzn-ctrl/flotta-nyilvantarto/';
const sha='a'.repeat(40),artifact='b'.repeat(64),rules='c'.repeat(64),
 migration='d'.repeat(64),scopeManifest='e'.repeat(64);

function pretendCompleteApproval(){
  // FAKE DATA ONLY: tests consistency; cannot simulate real independent audit.
  const f=copy(fixture);
  Object.assign(f.releaseCandidate,{
    commitSha:sha,webArtifactSha256:artifact,firestoreRulesSha256:rules,
    migrationPlanSha256:migration,targetFirebaseProject:'synthetic-not-real',
    targetEnvironment:'production',frozen:true,scope:'fleet-depot-v1',
    scopeManifestSha256:scopeManifest,
    scopeManifestEvidenceUrl:repo+'blob/'+sha+'/docs/V1_NARROWED_SCOPE.md'
  });
  for(const name of ['grok','chatgpt']){
    const a=f.auditors[name];
    Object.assign(a,{
      verdict:'GO',reviewedCandidateSha:sha,
      reviewedArtifactSha256:artifact,reviewedRulesSha256:rules,
      reviewedMigrationPlanSha256:migration,
      reviewedScopeManifestSha256:scopeManifest,
      reviewedAt:'2026-11-03T20:00:00Z',
      independentReportUrl:repo+'blob/'+sha+'/docs/'+name+'-release-audit.md',
      openCriticalIssues:[]
    });
    for(const id of AUDIT_GATES){
      a.gates[id]={result:id==='S8'?'EXCLUDED':'PASS',
        evidence:[repo+'actions/runs/1234567890']};
    }
  }
  f.userAuthorization={
    verdict:'GO',candidateSha:sha,artifactSha256:artifact,rulesSha256:rules,
    migrationPlanSha256:migration,scopeManifestSha256:scopeManifest,
    authorizedAt:'2026-11-03T20:01:00Z',
    approvalReference:'test-only-synthetic-consent'
  };
  f.deployment={status:'BLOCKED',scheduled:false,performed:false};
  return f;
}
const codes=r=>r.blockers.map(x=>x.code);

test('template is blocked: no signoffs, no user permission',()=>{
  const r=evaluateReleaseApproval(fixture);
  assert.equal(r.structurallyReady,false);
  assert.ok(codes(r).includes('GROK_VERDICT'));
  assert.ok(codes(r).includes('CHATGPT_VERDICT'));
  assert.ok(codes(r).includes('USER_GO'));
  assert.ok(codes(r).includes('CANDIDATE_FROZEN'));
});
test('synthetic fully-consistent structure passes but IS NOT deployment authorization',()=>{
  const r=evaluateReleaseApproval(pretendCompleteApproval());
  assert.equal(r.structurallyReady,true,JSON.stringify(r.blockers));
  assert.match(r.notice,/NOT proof/);
});
test('different candidate SHA invalidates Grok signoff',()=>{
  const x=pretendCompleteApproval();
  x.auditors.grok.reviewedCandidateSha='e'.repeat(40);
  assert.ok(codes(evaluateReleaseApproval(x)).includes('GROK_CANDIDATE'));
});
test('different rules artifact invalidates ChatGPT approval',()=>{
  const x=pretendCompleteApproval();
  x.auditors.chatgpt.reviewedRulesSha256='e'.repeat(64);
  assert.ok(codes(evaluateReleaseApproval(x)).includes('CHATGPT_reviewedRulesSha256'));
});
test('no user explicit GO blocks release',()=>{
  const x=pretendCompleteApproval();
  x.userAuthorization.verdict='PENDING';
  assert.ok(codes(evaluateReleaseApproval(x)).includes('USER_GO'));
});
test('new candidate change invalidates ALL 3 approvals',()=>{
  const x=pretendCompleteApproval();
  x.releaseCandidate.commitSha='9'.repeat(40);
  const keys=codes(evaluateReleaseApproval(x));
  assert.ok(keys.includes('GROK_CANDIDATE'));
  assert.ok(keys.includes('CHATGPT_CANDIDATE'));
  assert.ok(keys.includes('USER_CANDIDATE'));
});
test('missing one audit gate blocks release',()=>{
  const x=pretendCompleteApproval();
  x.auditors.grok.gates.S8.result='PENDING';
  assert.ok(codes(evaluateReleaseApproval(x)).includes('GROK_S8'));
});
test('a failed staging test cannot be ignored in an audit',()=>{
  const x=pretendCompleteApproval();
  x.auditors.chatgpt.gates.S11.result='FAIL';
  assert.ok(codes(evaluateReleaseApproval(x)).includes('CHATGPT_S11'));
});
test('two agents cannot reuse one report URL',()=>{
  const x=pretendCompleteApproval();
  x.auditors.chatgpt.independentReportUrl=x.auditors.grok.independentReportUrl;
  assert.ok(codes(evaluateReleaseApproval(x)).includes('AUDIT_INDEPENDENCE'));
});
test('unresolved critical issue blocks release',()=>{
  const x=pretendCompleteApproval();
  x.auditors.grok.openCriticalIssues=['Attendance Rules regression'];
  assert.ok(codes(evaluateReleaseApproval(x)).includes('GROK_BLOCKERS'));
});
test('no deploy or secret operation is ever performed by this validator',()=>{
  const x=pretendCompleteApproval();
  x.deployment.performed=true;
  assert.ok(codes(evaluateReleaseApproval(x)).includes('DEPLOYMENT_STATE'));
});
test('user permission must reference exact artifact AND migration plan',()=>{
  const x=pretendCompleteApproval();
  x.userAuthorization.migrationPlanSha256='f'.repeat(64);
  assert.ok(codes(evaluateReleaseApproval(x)).includes('USER_migrationPlanSha256'));
});

test('report gate S8 may be EXCLUDED only for narrowed Fleet+Depot scope',()=>{
  const x=pretendCompleteApproval();
  assert.equal(x.auditors.grok.gates.S8.result,'EXCLUDED');
  assert.equal(evaluateReleaseApproval(x).structurallyReady,true);
  x.releaseCandidate.scope='full-v1';
  assert.ok(codes(evaluateReleaseApproval(x)).includes('SCOPE'));
});
test('marking S8 PASS in report-excluded V1 is a scope mismatch',()=>{
  const x=pretendCompleteApproval();
  x.auditors.chatgpt.gates.S8.result='PASS';
  assert.ok(codes(evaluateReleaseApproval(x)).includes('CHATGPT_S8'));
});
test('S8 exclusion without independently verifiable evidence still blocks GO',()=>{
  const x=pretendCompleteApproval();
  x.auditors.grok.gates.S8.evidence=[];
  assert.ok(codes(evaluateReleaseApproval(x)).includes('GROK_S8'));
});
test('S12 courier/PWA negative security proof is mandatory – NEVER excluded',()=>{
  const x=pretendCompleteApproval();
  x.auditors.grok.gates.S12.result='EXCLUDED';
  assert.ok(codes(evaluateReleaseApproval(x)).includes('GROK_S12'));
  x.auditors.grok.gates.S12.result='PASS';
  x.auditors.grok.gates.S12.evidence=[];
  assert.ok(codes(evaluateReleaseApproval(x)).includes('GROK_S12'));
});
test('not naming ALL deferred modules fails scope contract',()=>{
  const x=pretendCompleteApproval();
  x.releaseCandidate.excludedFeatures=['ofd-monitoring'];
  assert.ok(codes(evaluateReleaseApproval(x)).includes('SCOPE_EXCLUSIONS'));
});
test('scope manifest SHA and review URL must be supplied and content-addressed',()=>{
  const x=pretendCompleteApproval();
  x.releaseCandidate.scopeManifestSha256=null;
  assert.ok(codes(evaluateReleaseApproval(x)).includes('SCOPE_MANIFEST_SHA'));
  x.releaseCandidate.scopeManifestSha256=scopeManifest;
  x.releaseCandidate.scopeManifestEvidenceUrl='https://example.org/untrusted';
  assert.ok(codes(evaluateReleaseApproval(x)).includes('SCOPE_MANIFEST_EVIDENCE'));
});
test('Grok and ChatGPT must review SAME exact exclusion artifact',()=>{
  const x=pretendCompleteApproval();
  x.auditors.grok.reviewedScopeManifestSha256='f'.repeat(64);
  assert.ok(codes(evaluateReleaseApproval(x)).includes('GROK_SCOPE_MANIFEST'));
});
test('user must explicitly authorize exact scope artifact too',()=>{
  const x=pretendCompleteApproval();
  x.userAuthorization.scopeManifestSha256='f'.repeat(64);
  assert.ok(codes(evaluateReleaseApproval(x)).includes('USER_SCOPE_MANIFEST'));
});
