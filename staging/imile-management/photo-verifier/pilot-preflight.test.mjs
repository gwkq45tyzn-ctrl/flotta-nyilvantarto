import {test} from 'node:test';
import assert from 'node:assert/strict';
import {inspectPilot} from './pilot-preflight.mjs';
test('403 is UNKNOWN, never interpreted as resource absence',async()=>{
 const r=await inspectPilot(async()=>({http:403,data:{error:{status:'PERMISSION_DENIED'}}}));
 assert.equal(r.decision,'NO-GO');assert.equal(r.bucketCount,null);assert.ok(r.blockers.includes('PHOTO_BUCKET_UNKNOWN'));
 assert.equal(r.functionsKnown,false);assert.ok(r.evidence.every(e=>e.status==='UNKNOWN'));
});
test('read only fixed staging endpoints, no create/enable or IAM mutations',async()=>{
 const urls=[];await inspectPilot(async(url,body)=>{urls.push(url);if(body)assert.ok(url.endsWith(':getIamPolicy'));assert.doesNotMatch(url,/:setIamPolicy|:enable|:create|:deploy/);return {http:404,data:{}};});
 assert.ok(urls.every(u=>u.includes('imile-management-staging')));assert.ok(urls.length>5);
});
test('public report excludes raw IAM principals and error text',async()=>{
 const r=await inspectPilot(async url=>url.endsWith(':getIamPolicy')?{http:200,data:{bindings:[{role:'roles/owner',members:['user:private@example.invalid']}]}}:{http:403,data:{error:{status:'PERMISSION_DENIED',message:'secret diagnostic'}}});
 assert.doesNotMatch(JSON.stringify(r),/private@example|secret diagnostic/);
});
test('unapproved budget and policy remain NO-GO despite billing state',async()=>{
 const r=await inspectPilot(async()=>({http:200,data:{billingEnabled:true,projectNumber:'123',state:'ENABLED'}}));
 assert.equal(r.decision,'NO-GO');assert.ok(r.blockers.includes('UNAPPROVED_BILLING'));assert.ok(r.blockers.includes('EFFECTIVE_IAM_OWNER_REVIEW_REQUIRED'));
});
