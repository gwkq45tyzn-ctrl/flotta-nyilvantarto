/**
 * iMile V1 advisory release-gate consistency checker.
 *
 * It does NOT authenticate who wrote a report/JSON, validate GitHub evidence,
 * contact Firebase, grant permission or deploy anything. Only the user can
 * authorize live deployment after two independently verified human-reviewed
 * agent audit reports (Grok and ChatGPT) for the exact same frozen artifact.
 */
import fs from 'node:fs';
import process from 'node:process';

export const AUDIT_GATES=Object.freeze(Array.from({length:12},(_,i)=>'S'+(i+1)));
export const NARROWED_V1_EXCLUSIONS=Object.freeze([
  'ofd-monitoring','in-hub-inventory','excel-reports',
  'attendance-pwa','courier-auth','photo-upload'
]);
const commitOk=v=>typeof v==='string'&&/^[0-9a-f]{40}$/.test(v);
const digestOk=v=>typeof v==='string'&&/^[0-9a-f]{64}$/.test(v);
const dateOk=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(v)
  &&Number.isFinite(Date.parse(v));
const githubLink=v=>typeof v==='string'&&
  v.startsWith('https://github.com/gwkq45tyzn-ctrl/flotta-nyilvantarto/')&&
  !v.includes(' ')&&v.length<2048;
const reasons=(v)=>v==null?[]:(Array.isArray(v)?v:[]);

/** Check consistency only; passing does NOT grant deployment authorization. */
export function evaluateReleaseApproval(record){
  const blockers=[];
  const fail=(code,why)=>blockers.push({code,why});
  if(!record||typeof record!=='object'||record.schemaVersion!==1){
    return {structurallyReady:false,blockers:[{code:'SCHEMA',why:'Unknown or missing release approval schema'}]};
  }
  const c=record.releaseCandidate||{};
  // The owner selected a narrower Fleet+Depot V1. S8 report functionality is
  // excluded, but a content-addressed scope manifest and independent proof of
  // exclusion are REQUIRED. S12 must still prove forbidden courier/PWA access.
  if(c.scope!=='fleet-depot-v1')
    fail('SCOPE','Release must be the owner-approved narrowed Fleet+Depot V1');
  if(!Array.isArray(c.excludedFeatures)||
     c.excludedFeatures.length!==NARROWED_V1_EXCLUSIONS.length||
     !NARROWED_V1_EXCLUSIONS.every((f,i)=>c.excludedFeatures[i]===f))
    fail('SCOPE_EXCLUSIONS','Deferred report and PWA modules must be explicitly excluded');
  if(!digestOk(c.scopeManifestSha256))
    fail('SCOPE_MANIFEST_SHA','Frozen exclusion manifest SHA-256 is missing');
  if(!githubLink(c.scopeManifestEvidenceUrl))
    fail('SCOPE_MANIFEST_EVIDENCE','Exclusion manifest needs a reviewable GitHub evidence link');
  if(!commitOk(c.commitSha))fail('CANDIDATE_SHA','Frozen 40-character commit is missing');
  if(!digestOk(c.webArtifactSha256))fail('ARTIFACT_SHA','Web release artifact SHA-256 is missing');
  if(!digestOk(c.firestoreRulesSha256))fail('RULES_SHA','Rules SHA-256 is missing');
  if(!digestOk(c.migrationPlanSha256))fail('MIGRATION_SHA','Migration plan SHA-256 is missing');
  if(c.frozen!==true)fail('CANDIDATE_FROZEN','Release candidate is not frozen');
  if(c.targetEnvironment!=='production')fail('ENVIRONMENT','This gate is for final production only');
  if(typeof c.targetFirebaseProject!=='string'||!c.targetFirebaseProject.trim()||
     /^demo[-_]/i.test(c.targetFirebaseProject.trim()))
    fail('PROJECT','Approved non-demo target Firebase project must be identified');

  const reports=[];
  for(const name of ['grok','chatgpt']){
    const a=record.auditors?.[name]||{};
    if(a.verdict!=='GO')fail(name.toUpperCase()+'_VERDICT',name+' has not independently approved');
    if(a.reviewedCandidateSha!==c.commitSha||!commitOk(a.reviewedCandidateSha))
      fail(name.toUpperCase()+'_CANDIDATE',name+' reviewed a different or invalid commit');
    for(const [prop,cprop]of [
      ['reviewedArtifactSha256','webArtifactSha256'],
      ['reviewedRulesSha256','firestoreRulesSha256'],
      ['reviewedMigrationPlanSha256','migrationPlanSha256']]){
      if(!digestOk(a[prop])||a[prop]!==c[cprop])
        fail(name.toUpperCase()+'_'+prop,name+' did not review the exact same '+cprop);
    }
    if(!digestOk(a.reviewedScopeManifestSha256)||
       a.reviewedScopeManifestSha256!==c.scopeManifestSha256)
      fail(name.toUpperCase()+'_SCOPE_MANIFEST',
        name+' did not independently review the exact release exclusions');
    if(!dateOk(a.reviewedAt))fail(name.toUpperCase()+'_TIME',name+' review timestamp is missing');
    if(!githubLink(a.independentReportUrl))
      fail(name.toUpperCase()+'_REPORT',name+' must provide an independently inspectable GitHub report');
    else reports.push(a.independentReportUrl);
    if(!Array.isArray(a.openCriticalIssues)||a.openCriticalIssues.length!==0)
      fail(name.toUpperCase()+'_BLOCKERS',name+' has unresolved or unverified critical issues');
    for(const gate of AUDIT_GATES){
      const check=a.gates?.[gate];
      const expectedResult=gate==='S8'?'EXCLUDED':'PASS';
      // S8 may be excluded only under the EXACT frozen V1 artifact manifest.
      // S12 remains PASS + evidence: exclusion requires negative Rules/QA proof.
      if(!check||check.result!==expectedResult||!Array.isArray(check.evidence)||
         !check.evidence.length||!check.evidence.every(githubLink)){
        fail(name.toUpperCase()+'_'+gate,name+' has not evidenced the complete '+gate+' audit gate');
      }
    }
  }
  if(reports.length===2&&reports[0]===reports[1])
    fail('AUDIT_INDEPENDENCE','Grok and ChatGPT must submit DIFFERENT review reports');

  const u=record.userAuthorization||{};
  if(!digestOk(u.scopeManifestSha256)||
     u.scopeManifestSha256!==c.scopeManifestSha256)
    fail('USER_SCOPE_MANIFEST','User has not approved the exact Fleet+Depot exclusion artifact');
  if(u.verdict!=='GO')fail('USER_GO','User has not explicitly authorized production release');
  if(!commitOk(u.candidateSha)||u.candidateSha!==c.commitSha)
    fail('USER_CANDIDATE','User has not approved this exact candidate SHA');
  for(const [up,cp]of [
    ['artifactSha256','webArtifactSha256'],
    ['rulesSha256','firestoreRulesSha256'],
    ['migrationPlanSha256','migrationPlanSha256']]){
    if(!digestOk(u[up])||u[up]!==c[cp])
      fail('USER_'+up,'User approval does not match '+cp);
  }
  if(!dateOk(u.authorizedAt))fail('USER_TIME','Explicit user approval timestamp is missing');
  if(typeof u.approvalReference!=='string'||u.approvalReference.trim().length<8)
    fail('USER_PROOF','User approval reference is missing and must be independently verified');
  if(record.deployment?.status!=='BLOCKED'||record.deployment?.performed!==false||
     record.deployment?.scheduled!==false)
    fail('DEPLOYMENT_STATE','Preflight must not trigger or claim that deployment already occurred');

  return {
    structurallyReady:blockers.length===0,
    blockers,
    notice:'Structural consistency only. This is NOT proof of actual artifact exclusions, independent identity, user permission or a deployment authorization.'
  };
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href){
  const filepath=process.argv[2]||'docs/IMILE_V1_RELEASE_APPROVAL_TEMPLATE.json';
  let result;
  try{result=evaluateReleaseApproval(JSON.parse(fs.readFileSync(filepath,'utf8')))}
  catch(error){console.error('RELEASE BLOCKED: '+error.message);process.exitCode=1;}
  if(result){
    console.log(result.structurallyReady?'STRUCTURALLY CONSISTENT – MANUAL VALIDATION STILL REQUIRED':'RELEASE BLOCKED');
    for(const b of result.blockers)console.log(b.code+': '+b.why);
    console.log(result.notice);
    if(!result.structurallyReady)process.exitCode=1;
  }
}
