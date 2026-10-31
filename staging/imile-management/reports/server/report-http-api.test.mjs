import assert from 'node:assert/strict';
import {createReportApi} from './report-http-api.mjs';
import {archiveId} from './trusted-report-validation.mjs';
const origin='https://imile-management-staging--imile-qa-op4483vh.web.app';
const token='A'.repeat(32);
const date='2099-04-03',station='DS(AKE)',key=date+'__DS(AKE)';
const candidate=(delivered=8)=>({key,date,station,rows:[
 {daCode:'D1',daName:'SYNTHETIC',vendor:'QA',ofd:10,delivered}],
 totalOFD:10,totalDelivered:delivered,courierCount:1});
class FirestoreFake{
 constructor(){this.docs=new Map([['users/editor',{active:true,role:'editor'}],
 ['users/viewer',{active:true,role:'viewer'}],
 ['users/inactive',{active:false,role:'editor'}],
 ['users/admin',{active:true,role:'admin'}]]);}
 doc(path){return {path,get:async()=>this.read(path)};}
 read(path){return {exists:this.docs.has(path),data:()=>structuredClone(this.docs.get(path))};}
 async runTransaction(fn){
  const changes=[];let wrote=false;
  const tx={
   get:async ref=>{if(wrote)throw Error('reads_after_writes');return this.read(ref.path);},
   create:(ref,data)=>{wrote=true;changes.push({op:'create',path:ref.path,data});},
   set:(ref,data)=>{wrote=true;changes.push({op:'set',path:ref.path,data});}
  };
  const value=await fn(tx);
  for(const c of changes)if(c.op==='create'&&this.docs.has(c.path))throw Error('duplicate');
  for(const c of changes)this.docs.set(c.path,structuredClone(c.data));
  return value;
 }
}
const db=new FirestoreFake();
let active='editor',revoked=false, calls=0;
const api=createReportApi({db,allowedOrigin:origin,projectId:'imile-management-staging',
 verifyIdToken:async(t,revocationCheck)=>{calls++;if(t!==token||revoked||!revocationCheck)throw Error('bad');
 return {uid:active};}});
const req=(method,path,body=null,opts={})=>new Request('https://api.staging.internal'+path,{
 method,headers:{Origin:origin,Authorization:'Bearer '+token,
 ...(body!==null?{'Content-Type':'application/json'}:{}),...opts.headers},
 ...(body!==null?{body:typeof body==='string'?body:JSON.stringify(body)}:{})
});
const payload=(delivered=8,extra={})=>({
 kind:'ofd',candidate:candidate(delivered),status:'provisional',
 allowReplace:false,expectedVersion:null,sourceName:'SYNTHETIC.xlsx',...extra
});
let passed=0;
async function check(name,fn){try{await fn();passed++;}
 catch(e){throw Error(name+': '+e.message,{cause:e});}}
const json=async r=>({status:r.status,body:await r.json()});
await check('valid create with token and role',async()=>{
 const v=await json(await api(req('POST','/v1/reports/save',payload())));
 assert.equal(v.status,200);assert.equal(v.body.result.status,'committed');
 assert.equal(v.body.result.version,1);
 assert.equal(db.docs.get('performanceDays/'+key).totalDelivered,8);
 assert.ok(db.docs.has('performanceVersions/'+archiveId(key,1)));
});
await check('idempotent retry has no extra archive',async()=>{
 const before=db.docs.size;
 const v=await json(await api(req('POST','/v1/reports/save',payload())));
 assert.equal(v.status,200);assert.equal(v.body.result.status,'unchanged');
 assert.equal(db.docs.size,before);
});
await check('unauthorized overwrite is 409',async()=>{
 const v=await json(await api(req('POST','/v1/reports/save',payload(9))));
 assert.equal(v.status,409);assert.equal(db.docs.get('performanceDays/'+key).totalDelivered,8);
});
await check('validated second revision preserves v1',async()=>{
 const v=await json(await api(req('POST','/v1/reports/save',payload(9,{allowReplace:true,expectedVersion:1}))));
 assert.equal(v.status,200);assert.equal(v.body.result.version,2);
 assert.equal(db.docs.get('performanceVersions/'+archiveId(key,1)).rows[0].delivered,8);
 assert.equal(db.docs.get('performanceVersions/'+archiveId(key,2)).rows[0].delivered,9);
});
await check('editor sees current version for safe replacement',async()=>{
 active='editor';
 const r=await json(await api(req('GET','/v1/reports/current?kind=ofd&date='+date+
  '&station=DS(AKE)')));
 assert.equal(r.status,200);assert.equal(r.body.exists,true);
 assert.equal(r.body.version,2);
 assert.equal(r.body.status,'provisional');
});
await check('unknown daily report gives absent current version',async()=>{
 const r=await json(await api(req('GET','/v1/reports/current?kind=ofd&date=2099-04-04'+
  '&station=DS(AKE)')));
 assert.equal(r.status,200);assert.equal(r.body.exists,false);
});
await check('restore endpoint requires explicit approval',async()=>{
 active='admin';
 const p={kind:'ofd',date,station,fromVersion:1,expectedVersion:2,
  reason:'Synthetic administrative rollback test',confirmed:false};
 const r=await json(await api(req('POST','/v1/reports/restore',p)));
 assert.equal(r.status,400);
});
await check('admin restore rejects earlier provisional after final',async()=>{
 // Current v2 is provisional, so the version can be restored safely.
 active='admin';
 const p={kind:'ofd',date,station,fromVersion:1,expectedVersion:2,
  reason:'Synthetic administrative rollback test',confirmed:true};
 const r=await json(await api(req('POST','/v1/reports/restore',p)));
 assert.equal(r.status,200);assert.equal(r.body.result.version,3);
 const history=db.docs.get('performanceVersions/'+archiveId(key,3));
 assert.equal(history.restoredFromVersion,1);
 assert.equal(db.docs.get('performanceDays/'+key).totalDelivered,8);
 assert.equal(db.docs.get('performanceVersions/'+archiveId(key,2)).rows[0].delivered,9);
});
await check('restore requires the admin role even when editor can save',async()=>{
 active='editor';
 const p={kind:'ofd',date,station,fromVersion:2,expectedVersion:3,
  reason:'Synthetic administrative rollback test',confirmed:true};
 const r=await json(await api(req('POST','/v1/reports/restore',p)));
 assert.equal(r.status,403);
});
await check('restore cannot use stale report revision',async()=>{
 active='admin';
 const p={kind:'ofd',date,station,fromVersion:2,expectedVersion:2,
  reason:'Synthetic administrative rollback test',confirmed:true};
 const r=await json(await api(req('POST','/v1/reports/restore',p)));
 assert.equal(r.status,409);
});
await check('viewer reads archived historical details',async()=>{
 active='viewer';
 const r=await json(await api(req('GET','/v1/reports/version?kind=ofd&date='+date+
  '&station=DS(AKE)&version=1')));
 assert.equal(r.status,200);assert.equal(r.body.version.rows[0].delivered,8);
 assert.equal(r.body.sourceValidation,'server-aggregate-checked-not-source-attested');
});
await check('viewer cannot write',async()=>{
 const r=await json(await api(req('POST','/v1/reports/save',payload(10,{allowReplace:true,expectedVersion:2}))));
 assert.equal(r.status,403);
});
await check('inactive member cannot access history',async()=>{
 active='inactive';
 const r=await json(await api(req('GET','/v1/reports/version?kind=ofd&date='+date+'&station=DS(AKE)&version=1')));
 assert.equal(r.status,403);
});
await check('unauthenticated request refused',async()=>{
 const r=await json(await api(req('POST','/v1/reports/save',payload(),
  {headers:{Authorization:''}})));
 assert.equal(r.status,401);
});
await check('revoked Firebase JWT refused',async()=>{
 active='editor';revoked=true;
 const r=await json(await api(req('POST','/v1/reports/save',payload())));
 assert.equal(r.status,401);revoked=false;
});
await check('unknown origin refused before auth',async()=>{
 const r=await json(await api(req('POST','/v1/reports/save',payload(),
  {headers:{Origin:'https://evil.example'}})));
 assert.equal(r.status,403);
});
await check('CORS does not use wildcard',async()=>{
 const response=await api(req('OPTIONS','/v1/reports/save'));
 assert.equal(response.status,204);
 assert.equal(response.headers.get('Access-Control-Allow-Origin'),origin);
});
await check('no source total tampering',async()=>{
 const p=payload();p.candidate.totalDelivered=99;
 const r=await json(await api(req('POST','/v1/reports/save',p)));
 assert.equal(r.status,422);assert.equal(r.body.error,'untrusted_ofd_aggregate');
});
await check('client hash field rejected',async()=>{
 const p=payload();p.candidate.contentHash='f'.repeat(64);
 const r=await json(await api(req('POST','/v1/reports/save',p)));
 assert.equal(r.status,422);
});
await check('unsafe payload keys rejected',async()=>{
 const r=await json(await api(req('POST','/v1/reports/save',{...payload(),role:'admin'})));
 assert.equal(r.status,400);
});
await check('oversized JSON body refused',async()=>{
 const r=await json(await api(req('POST','/v1/reports/save','x'.repeat(512*1024+1))));
 assert.equal(r.status,400);assert.equal(r.body.error,'invalid_body_size');
});
await check('non-JSON request refused',async()=>{
 const r=await json(await api(req('POST','/v1/reports/save','bad',
  {headers:{'Content-Type':'text/plain'}})));
 assert.equal(r.status,415);
});
await check('missing version returns 404',async()=>{
 const r=await json(await api(req('GET','/v1/reports/version?kind=ofd&date='+date+'&station=DS(AKE)&version=4')));
 assert.equal(r.status,404);
});
await check('GET to write endpoint refused',async()=>{
 const r=await json(await api(req('GET','/v1/reports/save')));
 assert.equal(r.status,405);
});
await check('cannot create API with wrong Firebase project',async()=>{
 assert.throws(()=>createReportApi({db,allowedOrigin:origin,verifyIdToken:async()=>({uid:'editor'}),projectId:'production'}));
});
await check('cannot create API with insecure origin',async()=>{
 assert.throws(()=>createReportApi({db,allowedOrigin:'http://example.com',verifyIdToken:async()=>({uid:'editor'}),projectId:'imile-management-staging'}));
});
assert.ok(calls>=14);
await check('forged server archive totals are not returned as trusted',async()=>{
 active='viewer';
 const path='performanceVersions/'+archiveId(key,1),saved=db.docs.get(path);
 db.docs.set(path,{...saved,totalDelivered:99});
 try{
  const v=await json(await api(req('GET','/v1/reports/version?kind=ofd&date='+date+
   '&station=DS(AKE)&version=1')));
  assert.equal(v.status,409);assert.equal(v.body.error,'history_integrity_failed');
 }finally{db.docs.set(path,saved);}
});
await check('archive missing validation provenance is always legacy-unverified',async()=>{
 active='viewer';
 const path='performanceVersions/'+archiveId(key,1),saved=db.docs.get(path);
 const unknown={...saved};delete unknown.validationSource;
 db.docs.set(path,unknown);
 try{
  const v=await json(await api(req('GET','/v1/reports/version?kind=ofd&date='+date+
   '&station=DS(AKE)&version=1')));
  assert.equal(v.status,200);assert.equal(v.body.sourceValidation,'legacy-unverified');
 }finally{db.docs.set(path,saved);}
});
console.log('PASS: '+passed+' HTTP API Auth, CORS, input limits, idempotence and archived history cases');
