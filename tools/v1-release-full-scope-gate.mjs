/**
 * Structural V1 release-scope inventory; NEVER a deployment/approval gate.
 *
 * #83 requires the *full* desktop V1: Fleet + Depot + In-Hub + OFD + Excel,
 * whereas docs/IMILE_V1_RELEASE_APPROVAL_TEMPLATE.json historically represents
 * a *narrowed* Fleet+Depot-only scope. This check cannot validate signatures,
 * principal IAM, real backups, live deployments, or human release approvals.
 */
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

export const REQUIRED_V1_MODULES=Object.freeze([
  'original-flotta','depo-capacity','shared-driver-and-vehicle-master',
  'in-hub-inventory','ofd-monitoring','excel-reports',
  'common-auth-and-restricted-rules'
]);
export const FUTURE_FEATURES=Object.freeze([
  'attendance-pwa','courier-self-service-auth','photo-upload','anpr','geofence'
]);
export const EXTERNAL_EVIDENCE_KEYS=Object.freeze([
  'currentRichFleetBackupSha256','sourceParityToLiveFirestore',
  'actualDriverCapacitiesAndStatusApproval',
  'currentDeployedAppsScriptWriterAndTriggerInventory',
  'liveFirebaseAuthUidAndIamPrincipals',
  'trustedIndependentSignerRootAndDurableAntiRollback',
  'actualFirestoreEncodedSize','deployedArtifactAndRulesReadback',
  'originalOperationalReportDatasetParity',
  'targetBillingSparkAndDataGovernance'
]);
const isObject=o=>o!==null&&typeof o==='object'&&!Array.isArray(o);
const has=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
export function assessFullV1ScopeContract(template){
  const issues=[];
  if(!isObject(template)||template.schemaVersion!==1)
    return {declaredFullScope:false,releaseAuthorized:false,
      reasons:['INVALID_OR_MISSING_SCOPE_CONTRACT']};
  const scope=template.scope;
  const included=isObject(scope)&&Array.isArray(scope.includedModules)
    ?scope.includedModules:[];
  const excluded=isObject(scope)&&Array.isArray(scope.excludedFutureFeatures)
    ?scope.excludedFutureFeatures:[];
  const narrowedExcluded=template.releaseCandidate?.excludedFeatures;
  if(scope?.kind!=='full-v1-desktop')
    issues.push('FULL_V1_SCOPE_NOT_DECLARED');
  const includedSet=new Set(included);
  const excludedSet=new Set(excluded);
  if(includedSet.size!==included.length||excludedSet.size!==excluded.length||
     included.some(x=>typeof x!=='string')||
     excluded.some(x=>typeof x!=='string'))
    issues.push('DUPLICATE_OR_MALFORMED_MODULE_SCOPE');
  for(const module of REQUIRED_V1_MODULES){
    if(!includedSet.has(module))issues.push('REQUIRED_MODULE_MISSING:'+module);
    if(excludedSet.has(module)||(
      Array.isArray(narrowedExcluded)&&narrowedExcluded.includes(module)
    ))issues.push('REQUIRED_MODULE_EXCLUDED:'+module);
  }
  for(const module of included){
    if(!REQUIRED_V1_MODULES.includes(module))
      issues.push('UNREVIEWED_SCOPE_ADDITION');
  }
  for(const feature of FUTURE_FEATURES){
    if(!excludedSet.has(feature))issues.push('UNREVIEWED_FUTURE_FEATURE:'+feature);
    if(includedSet.has(feature))issues.push('FUTURE_FEATURE_ENABLED:'+feature);
  }
  if(!isObject(template.requiredExternalEvidence))
    issues.push('EXTERNAL_EVIDENCE_INVENTORY_MISSING');
  else for(const key of EXTERNAL_EVIDENCE_KEYS){
    if(!has(template.requiredExternalEvidence,key))
      issues.push('EXTERNAL_EVIDENCE_SLOT_MISSING:'+key);
  }
  const gates=template.releaseGateS1toS12;
  if(!isObject(gates)||Object.keys(gates).length!==12)
    issues.push('S1_TO_S12_GATE_MATRIX_INCOMPLETE');
  for(let i=1;i<=12;i++){
    const gate=gates?.['S'+i];
    if(!isObject(gate)||typeof gate.verdict!=='string'||
       !Array.isArray(gate.evidence))
      issues.push('RELEASE_GATE_ENTRY_MISSING:S'+i);
  }
  if(!isObject(template.independentAuditors)||
     !isObject(template.independentAuditors.grok)||
     !isObject(template.independentAuditors.chatgpt))
    issues.push('DUAL_INDEPENDENT_AUDIT_FIELDS_MISSING');
  if(!isObject(template.ownerAuthorization))
    issues.push('OWNER_EXACT_SHA_APPROVAL_FIELD_MISSING');
  if(template.deployment?.status!=='BLOCKED'||
     template.deployment?.performed!==false||
     template.deployment?.scheduled!==false)
    issues.push('RELEASE_TEMPLATE_MUST_REMAIN_BLOCKED');
  return {
    declaredFullScope:issues.length===0,
    releaseAuthorized:false,
    deployedArtifactVerified:false,
    externalEvidenceIndependentlyVerified:false,
    bothIndependentFullGoVerified:false,
    ownerApprovalVerified:false,
    reasons:issues,
    // Return only module names; no private source data or identities.
    requiredModules:[...REQUIRED_V1_MODULES]
  };
}
function cli(){
  try{
    const root=resolve(fileURLToPath(new URL('../',import.meta.url)));
    const full=JSON.parse(readFileSync(resolve(root,
      'docs/IMILE_V1_FULL_SCOPE_RELEASE_TEMPLATE.json'),'utf8'));
    const legacy=JSON.parse(readFileSync(resolve(root,
      'docs/IMILE_V1_RELEASE_APPROVAL_TEMPLATE.json'),'utf8'));
    const a=assessFullV1ScopeContract(full);
    const b=assessFullV1ScopeContract(legacy);
    if(!a.declaredFullScope||b.declaredFullScope||
       a.releaseAuthorized||b.releaseAuthorized)
      throw Error('FULL_SCOPE_CONTRACT_MISMATCH');
    console.log(JSON.stringify({
      check:'FULL_V1_SCOPE_ONLY_NOT_RELEASE_AUTHORIZATION',
      fullScopeDeclared:true,legacyNarrowedScopeRejected:true,
      fullReleaseAuthorized:false,
      requiredModuleCount:a.requiredModules.length
    }));
  }catch(_){
    console.error('V1_FULL_SCOPE_CONTRACT_DENIED');
    process.exitCode=2;
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
  cli();
