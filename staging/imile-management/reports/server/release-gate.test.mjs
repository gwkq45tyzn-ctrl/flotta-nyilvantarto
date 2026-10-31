import assert from 'node:assert/strict';
import {assessReportReleaseGate} from './release-gate.mjs';

const good={
 REPORT_API_PROJECT_ID:'imile-management-staging',
 REPORT_DEPLOY_CHANNEL:'imile-qa',
 REPORT_BUSINESS_DATA_PROCESSING_APPROVED:'true',
 REPORT_CLOUD_COST_APPROVED:'true',
 REPORT_PRIVATE_INGRESS_APPROVED:'true',
 REPORT_BACKEND_IDTOKEN_REVOCATION_CHECKED:'true',
 REPORT_BROWSER_WRITE_DENIAL_EMULATOR_PASSED:'true',
 REPORT_ADMIN_TRANSACTION_EMULATOR_PASSED:'true',
 REPORT_FULL_ARCHIVE_RESTORE_TESTED:'true',
 REPORT_SOURCE_VALIDATION_APPROVED:'true',
 REPORT_POSTDEPLOY_QA_APPROVED:'true',
 REPORT_ROLLBACK_PLAN_APPROVED:'true',
 REPORT_API_PUBLIC_ORIGIN:'https://report-api.qa.example.org',
 REPORT_HOSTING_ORIGIN:'https://imile-management-staging--imile-qa-op4483vh.web.app',
 REPORT_API_ENABLED:'true',
 REPORT_BACKEND_SERVICE_ACCOUNT:'dedicated-staging-only'
};
let n=0;
const test=(label,env,yes,blocker)=>{
 const actual=assessReportReleaseGate(env);
 assert.equal(actual.approved,yes,label);
 if(blocker)assert.ok(actual.blockers.includes(blocker),label+': '+blocker);
 n++;
};
test('no approvals fails closed',{},false,'wrong_firebase_project');
test('all explicitly approved is accepted by pure policy',good,true);
const cases=[
 ['REPORT_API_PROJECT_ID','production','wrong_firebase_project'],
 ['REPORT_DEPLOY_CHANNEL','live','not_staging_preview'],
 ['REPORT_BUSINESS_DATA_PROCESSING_APPROVED','false','data_processing_approval_missing'],
 ['REPORT_CLOUD_COST_APPROVED','false','cloud_cost_approval_missing'],
 ['REPORT_PRIVATE_INGRESS_APPROVED','false','private_ingress_approval_missing'],
 ['REPORT_BACKEND_IDTOKEN_REVOCATION_CHECKED','false','auth_revocation_qa_missing'],
 ['REPORT_BROWSER_WRITE_DENIAL_EMULATOR_PASSED','false','direct_write_denial_qa_missing'],
 ['REPORT_ADMIN_TRANSACTION_EMULATOR_PASSED','false','admin_transaction_qa_missing'],
 ['REPORT_FULL_ARCHIVE_RESTORE_TESTED','false','archive_restore_qa_missing'],
 ['REPORT_SOURCE_VALIDATION_APPROVED','false','raw_export_validation_missing'],
 ['REPORT_POSTDEPLOY_QA_APPROVED','false','postdeploy_qa_plan_missing'],
 ['REPORT_ROLLBACK_PLAN_APPROVED','false','rollback_plan_missing'],
 ['REPORT_API_PUBLIC_ORIGIN','http://insecure.example.org','api_origin_invalid'],
 ['REPORT_API_PUBLIC_ORIGIN','https://localhost:8080','api_origin_invalid'],
 ['REPORT_HOSTING_ORIGIN','https://example.com','hosting_origin_unapproved'],
 ['REPORT_API_ENABLED','false','report_api_not_enabled'],
 ['REPORT_BACKEND_SERVICE_ACCOUNT','unknown','dedicated_server_identity_missing'],
 ['REPORT_ADMIN_CREDENTIALS_EXPOSED','true','exposed_credentials_forbidden'],
 ['REPORT_PRODUCTION_DEPLOY','true','production_deploy_forbidden']
];
for(const [field,value,blocker] of cases)test(field,{...good,[field]:value},false,blocker);
assert.equal(assessReportReleaseGate({...good,REPORT_PRIVATE_INGRESS_APPROVED:undefined}).approved,false);n++;
const a=assessReportReleaseGate(good);
assert.throws(()=>a.blockers.push('evil'),TypeError);n++;
console.log('PASS: '+n+' fail-closed release gates and explicit approval isolation cases');
