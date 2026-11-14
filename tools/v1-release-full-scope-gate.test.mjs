import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  assessFullV1ScopeContract,REQUIRED_V1_MODULES,
  FUTURE_FEATURES,EXTERNAL_EVIDENCE_KEYS
} from './v1-release-full-scope-gate.mjs';

const root=resolve(fileURLToPath(new URL('../',import.meta.url)));
const file=name=>JSON.parse(readFileSync(resolve(root,'docs',name),'utf8'));
const full=()=>file('IMILE_V1_FULL_SCOPE_RELEASE_TEMPLATE.json');
const legacy=()=>file('IMILE_V1_RELEASE_APPROVAL_TEMPLATE.json');

test('new FULL template covers all report modules and remains never release-authorizing',()=>{
  const template=full(),review=assessFullV1ScopeContract(template);
  assert.equal(review.declaredFullScope,true);
  assert.equal(review.reasons.length,0);
  assert.equal(review.releaseAuthorized,false);
  assert.equal(review.bothIndependentFullGoVerified,false);
  assert.equal(review.deployedArtifactVerified,false);
  assert.equal(review.externalEvidenceIndependentlyVerified,false);
  assert.equal(review.ownerApprovalVerified,false);
  assert.equal(template.deployment.status,'BLOCKED');
  assert.equal(template.ownerAuthorization.verdict,'PENDING');
  for(const m of REQUIRED_V1_MODULES)assert.ok(template.scope.includedModules.includes(m),m);
  for(const f of FUTURE_FEATURES)assert.ok(template.scope.excludedFutureFeatures.includes(f),f);
  for(const e of EXTERNAL_EVIDENCE_KEYS)assert.equal(template.requiredExternalEvidence[e],null,e);
});

test('legacy narrowed Fleet+Depot approval template can NEVER be full V1 scope',()=>{
  const review=assessFullV1ScopeContract(legacy());
  assert.equal(review.declaredFullScope,false);
  assert.equal(review.releaseAuthorized,false);
  assert.ok(review.reasons.includes('FULL_V1_SCOPE_NOT_DECLARED'));
  assert.ok(review.reasons.some(s=>s.includes('REQUIRED_MODULE_MISSING:ofd-monitoring')));
  assert.ok(review.reasons.some(s=>s.includes('REQUIRED_MODULE_MISSING:in-hub-inventory')));
  assert.ok(review.reasons.some(s=>s.includes('REQUIRED_MODULE_MISSING:excel-reports')));
});

test('reports cannot be omitted, excluded or replaced with an unrelated feature',()=>{
  const a=full();
  a.scope.includedModules=a.scope.includedModules.filter(x=>x!=='ofd-monitoring');
  let r=assessFullV1ScopeContract(a);
  assert.equal(r.declaredFullScope,false);
  assert.ok(r.reasons.includes('REQUIRED_MODULE_MISSING:ofd-monitoring'));

  const b=full();
  b.scope.excludedFutureFeatures.push('excel-reports');
  r=assessFullV1ScopeContract(b);
  assert.equal(r.declaredFullScope,false);
  assert.ok(r.reasons.includes('REQUIRED_MODULE_EXCLUDED:excel-reports'));

  const c=full();
  c.scope.includedModules.push('attendance-pwa');
  r=assessFullV1ScopeContract(c);
  assert.equal(r.declaredFullScope,false);
  assert.ok(r.reasons.includes('UNREVIEWED_SCOPE_ADDITION'));
  assert.ok(r.reasons.includes('FUTURE_FEATURE_ENABLED:attendance-pwa'));
});

test('missing S8 report evidence slot, dual auditors, or any S1-S12 entry refuses full scope',()=>{
  const a=full();
  delete a.requiredExternalEvidence.originalOperationalReportDatasetParity;
  let r=assessFullV1ScopeContract(a);
  assert.equal(r.declaredFullScope,false);
  assert.ok(r.reasons.includes(
    'EXTERNAL_EVIDENCE_SLOT_MISSING:originalOperationalReportDatasetParity'));
  const b=full();
  delete b.independentAuditors.grok;
  r=assessFullV1ScopeContract(b);
  assert.equal(r.declaredFullScope,false);
  assert.ok(r.reasons.includes('DUAL_INDEPENDENT_AUDIT_FIELDS_MISSING'));
  const c=full();
  delete c.releaseGateS1toS12.S8;
  r=assessFullV1ScopeContract(c);
  assert.equal(r.declaredFullScope,false);
  assert.ok(r.reasons.includes('RELEASE_GATE_ENTRY_MISSING:S8'));
});

test('even forged green fields cannot confer release authority via structural validation',()=>{
  const forged=full();
  forged.releaseCandidate.commitSha='f'.repeat(40);
  forged.releaseCandidate.frozen=true;
  for(const actor of ['grok','chatgpt']){
    forged.independentAuditors[actor].verdict='GO';
    forged.independentAuditors[actor].reviewedSha='f'.repeat(40);
  }
  forged.ownerAuthorization={verdict:'GO',exactSha:'f'.repeat(40),
    approvalReference:'UNTRUSTED-STRING'};
  for(const gate of Object.values(forged.releaseGateS1toS12)){
    gate.verdict='GO';gate.evidence=['UNTRUSTED-STRING'];
  }
  for(const key of EXTERNAL_EVIDENCE_KEYS)
    forged.requiredExternalEvidence[key]='UNTRUSTED-STRING';
  const review=assessFullV1ScopeContract(forged);
  assert.equal(review.declaredFullScope,true);
  assert.equal(review.releaseAuthorized,false);
  assert.equal(review.ownerApprovalVerified,false);
  assert.equal(review.bothIndependentFullGoVerified,false);
  assert.equal(review.externalEvidenceIndependentlyVerified,false);
  forged.deployment.status='AUTHORIZED';
  const bad=assessFullV1ScopeContract(forged);
  assert.equal(bad.declaredFullScope,false);
  assert.ok(bad.reasons.includes('RELEASE_TEMPLATE_MUST_REMAIN_BLOCKED'));
});
