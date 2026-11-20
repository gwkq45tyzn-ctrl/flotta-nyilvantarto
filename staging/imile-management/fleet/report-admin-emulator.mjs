/**
 * Real Firebase Admin SDK -> Firestore emulator E2E.
 * Uses only synthetic, isolated demo project documents.
 * Must never run against a cloud Firestore database.
 */
import assert from 'node:assert/strict';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {commitTrustedReport,restoreTrustedReport,archiveId,validateTrustedReport} from
 '../reports/server/trusted-report-validation.mjs';
import {createReportApi} from '../reports/server/report-http-api.mjs';

if(process.env.GCLOUD_PROJECT!=='demo-imile-fleet' &&
 process.env.FIREBASE_PROJECT_ID!=='demo-imile-fleet' &&
 process.env.GOOGLE_CLOUD_PROJECT!=='demo-imile-fleet')
 throw Error('Emulator test requires explicit demo-imile-fleet project ID');
if(!/^127\.0\.0\.1:8787$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))
 throw Error('Cloud writes forbidden: local Firestore emulator required');
const app=initializeApp({projectId:'demo-imile-fleet'},'REPORT_ADMIN_SYNTHETIC_QA');
const db=getFirestore(app);
const prefix='SYNTHETIC_ADMIN_E2E_2099_',day='2099-04-07';
const station=prefix+'DS(AKE)',key=day+'__'+encodeURIComponent(station);
const courier=(delivered=7)=>({key,date:day,station,rows:[{
 daCode:'SYNTHETIC_DA_001',daName:'SYNTHETIC DRIVER',
 vendor:'SYNTHETIC VENDOR',ofd:10,delivered}],
 totalOFD:10,totalDelivered:delivered,courierCount:1});
const inv=(num=3)=>({key,date:day,station,dates:['2099-04-06'],
 areas:[{area:'Budapest XI.',counts:[num]}],total:num});
const action=(kind,candidate,extra={})=>({
 db,verifiedUid:'qa-editor',kind,candidate,
 status:kind==='ofd'?'provisional':null,sourceName:'SYNTHETIC_TEST_ONLY.xlsx',
 ...extra
});
let passed=0;
async function test(name,fn){
 try{await fn();passed++;console.log('PASS: '+name);}
 catch(error){throw Error(name+': '+error.message,{cause:error});}
}
try{
 await db.doc('users/qa-editor').set({name:'Synthetic Editor',role:'editor',active:true});
 await db.doc('users/qa-viewer').set({name:'Synthetic Viewer',role:'viewer',active:true});
 await test('first OFD transaction atomically creates current/archive/audit',async()=>{
  const result=await commitTrustedReport(action('ofd',courier()));
  assert.equal(result.status,'committed');assert.equal(result.version,1);
  const [current,history,audit]=await Promise.all([
   db.doc('performanceDays/'+key).get(),
   db.doc('performanceVersions/'+archiveId(key,1)).get(),
   db.doc('performanceAudits/'+result.auditId).get()
  ]);
  assert.equal(current.data().totalDelivered,7);
  assert.equal(history.data().rows[0].delivered,7);
  assert.equal(audit.data().version,1);
  assert.equal(current.data().validationSource,'server-aggregates-only');
 });
 await test('re-upload of same report returns unchanged, with single v1',async()=>{
  const result=await commitTrustedReport(action('ofd',courier()));
  assert.equal(result.status,'unchanged');assert.equal(result.version,1);
  const history=await db.collection('performanceVersions')
   .where('key','==',key).get();
  assert.equal(history.size,1);
 });
 await test('unauthorized viewer does not mutate verified report',async()=>{
  await assert.rejects(()=>commitTrustedReport(action('ofd',courier(8),
   {verifiedUid:'qa-viewer',allowReplace:true,expectedVersion:1})),
  /report_write_forbidden/);
 });
 await test('outdated expectedVersion is rejected atomically',async()=>{
  await assert.rejects(()=>commitTrustedReport(action('ofd',courier(8),
   {allowReplace:true,expectedVersion:99})),/replacement_not_approved/);
  assert.equal((await db.doc('performanceDays/'+key).get()).data().totalDelivered,7);
 });
 await test('simultaneous conflicting revisions cannot both commit',async()=>{
  const results=await Promise.allSettled([
   commitTrustedReport(action('ofd',courier(8),{allowReplace:true,expectedVersion:1})),
   commitTrustedReport(action('ofd',courier(9),{allowReplace:true,expectedVersion:1}))
  ]);
  assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
  assert.equal(results.filter(x=>x.status==='rejected').length,1);
  const current=(await db.doc('performanceDays/'+key).get()).data();
  assert.equal(current.version,2);
  assert.ok([8,9].includes(current.totalDelivered));
  const [v1,v2]=await Promise.all([
   db.doc('performanceVersions/'+archiveId(key,1)).get(),
   db.doc('performanceVersions/'+archiveId(key,2)).get()
  ]);
  assert.equal(v1.data().totalDelivered,7);
  assert.equal(v2.data().totalDelivered,current.totalDelivered);
 });
 await test('full archive survives current revision and data correction',async()=>{
  const result=await commitTrustedReport(action('ofd',courier(10),
   {allowReplace:true,expectedVersion:2,status:'final'}));
  assert.equal(result.version,3);
  assert.equal((await db.doc('performanceVersions/'+archiveId(key,1)).get()).data().rows[0].delivered,7);
  assert.equal((await db.doc('performanceVersions/'+archiveId(key,3)).get()).data().status,'final');
 });
 await test('final report cannot be downgraded',async()=>{
  await assert.rejects(()=>commitTrustedReport(action('ofd',courier(10),
   {allowReplace:true,expectedVersion:3,status:'provisional'})),/cannot_downgrade_final/);
 });
 await test('inventory has independent immutable version chain',async()=>{
  const first=await commitTrustedReport(action('inhub',inv()));
  const second=await commitTrustedReport(action('inhub',inv(4),
   {allowReplace:true,expectedVersion:1}));
  assert.equal(first.version,1);assert.equal(second.version,2);
  assert.equal((await db.doc('inventoryVersions/'+archiveId(key,1)).get()).data().total,3);
  assert.equal((await db.doc('inventoryVersions/'+archiveId(key,2)).get()).data().total,4);
 });
 await db.doc('users/qa-admin').set({name:'Synthetic Admin',role:'admin',active:true});
 await test('Admin restores full old inventory version without deleting newer archive',async()=>{
  const result=await restoreTrustedReport({db,verifiedUid:'qa-admin',
   kind:'inhub',date:day,station,fromVersion:1,expectedVersion:2,
   reason:'Synthetic Admin approved rollback'});
  assert.equal(result.version,3);
  assert.equal((await db.doc('inventoryDays/'+key).get()).data().total,3);
  assert.equal((await db.doc('inventoryVersions/'+archiveId(key,2)).get()).data().total,4);
  assert.equal((await db.doc('inventoryVersions/'+archiveId(key,3)).get()).data().restoredFromVersion,1);
  assert.equal((await db.doc('inventoryAudits/'+result.auditId).get()).data().action,'restore');
 });
 await test('Editor is denied restoring despite normal save permissions',async()=>{
  await assert.rejects(()=>restoreTrustedReport({db,verifiedUid:'qa-editor',
   kind:'inhub',date:day,station,fromVersion:2,expectedVersion:3,
   reason:'Synthetic Editor blocked rollback'}),/report_write_forbidden/);
 });
 await test('Stale restore attempt does not overwrite newest version',async()=>{
  await assert.rejects(()=>restoreTrustedReport({db,verifiedUid:'qa-admin',
   kind:'inhub',date:day,station,fromVersion:2,expectedVersion:2,
   reason:'Synthetic stale rollback attempt'}),/replacement_not_approved/);
  assert.equal((await db.doc('inventoryDays/'+key).get()).data().version,3);
 });
 await test('role deactivation is applied inside new transaction',async()=>{
  await db.doc('users/qa-editor').update({active:false});
  await assert.rejects(()=>commitTrustedReport(action('ofd',courier(9),
   {allowReplace:true,expectedVersion:3,status:'final'})),/report_write_forbidden/);
  await db.doc('users/qa-editor').update({active:true});
 });
 await test('HTTP endpoint works against Admin-backed emulator archive',async()=>{
  const origin='https://imile-management-staging--imile-qa-op4483vh.web.app';
  const api=createReportApi({db,projectId:'imile-management-staging',
   allowedOrigin:origin,verifyIdToken:async(token)=> {
    assert.equal(token,'T'.repeat(32));return {uid:'qa-viewer'};
   }});
  const request=new Request('https://api.staging.invalid/v1/reports/version?'+
   new URLSearchParams({kind:'ofd',date:day,station,version:'1'}),{
    headers:{Authorization:'Bearer '+'T'.repeat(32),Origin:origin}});
  const response=await api(request);
  assert.equal(response.status,200);
  const history=(await response.json()).version;
  assert.equal(history.rows[0].delivered,7);
  assert.equal(history.validationSource,'server-aggregates-only');
 });
 console.log('PASS: '+passed+' REAL Firestore Admin SDK emulator transactions, history and race tests');
}finally{
 await deleteApp(app);
}
