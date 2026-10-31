/**
 * Fail-closed checklist for a FUTURE private Firebase Admin API staging rollout.
 * Never deploys, modifies configuration, calls external services or reads secrets.
 * Requires an explicit human-issued approval signal for every safety gate.
 */
const secureUrl=x=>{
 if(typeof x!=='string')return false;
 try{
  const u=new URL(x);
  return u.protocol==='https:'&&u.username===''&&u.password===''&&
    u.pathname==='/'&&u.search===''&&u.hash===''&&
    !['localhost','127.0.0.1','0.0.0.0'].includes(u.hostname)&&
    /^(?:[a-z0-9-]+\.)+[a-z]{2,}$/i.test(u.hostname);
 }catch{return false;}
};
const truth=x=>x==='true';
export function assessReportReleaseGate(env={}){
 const problems=[];
 const need=(yes,reason)=>{if(!yes)problems.push(reason);};
 need(env.REPORT_API_PROJECT_ID==='imile-management-staging','wrong_firebase_project');
 need(env.REPORT_DEPLOY_CHANNEL==='imile-qa','not_staging_preview');
 need(truth(env.REPORT_BUSINESS_DATA_PROCESSING_APPROVED),'data_processing_approval_missing');
 need(truth(env.REPORT_CLOUD_COST_APPROVED),'cloud_cost_approval_missing');
 need(truth(env.REPORT_PRIVATE_INGRESS_APPROVED),'private_ingress_approval_missing');
 need(truth(env.REPORT_BACKEND_IDTOKEN_REVOCATION_CHECKED),'auth_revocation_qa_missing');
 need(truth(env.REPORT_BROWSER_WRITE_DENIAL_EMULATOR_PASSED),'direct_write_denial_qa_missing');
 need(truth(env.REPORT_ADMIN_TRANSACTION_EMULATOR_PASSED),'admin_transaction_qa_missing');
 need(truth(env.REPORT_FULL_ARCHIVE_RESTORE_TESTED),'archive_restore_qa_missing');
 need(truth(env.REPORT_SOURCE_VALIDATION_APPROVED),'raw_export_validation_missing');
 need(truth(env.REPORT_POSTDEPLOY_QA_APPROVED),'postdeploy_qa_plan_missing');
 need(truth(env.REPORT_ROLLBACK_PLAN_APPROVED),'rollback_plan_missing');
 need(secureUrl(env.REPORT_API_PUBLIC_ORIGIN),'api_origin_invalid');
 need(env.REPORT_HOSTING_ORIGIN==='https://imile-management-staging--imile-qa-op4483vh.web.app',
  'hosting_origin_unapproved');
 need(env.REPORT_API_ENABLED==='true','report_api_not_enabled');
 need(env.REPORT_BACKEND_SERVICE_ACCOUNT==='dedicated-staging-only',
  'dedicated_server_identity_missing');
 if(env.REPORT_ADMIN_CREDENTIALS_EXPOSED==='true')
  problems.push('exposed_credentials_forbidden');
 if(env.REPORT_PRODUCTION_DEPLOY==='true')
  problems.push('production_deploy_forbidden');
 return Object.freeze({approved:problems.length===0,
  project:'imile-management-staging',channel:'imile-qa',
  blockers:Object.freeze(problems)});
}
// Read-only, CLI-friendly manual verification. Never exits successfully
// when an approval flag is missing, and never attempts a real deployment.
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href){
 const result=assessReportReleaseGate(process.env);
 process.stdout.write(JSON.stringify(result,null,2)+'\n');
 if(!result.approved)process.exitCode=2;
}
