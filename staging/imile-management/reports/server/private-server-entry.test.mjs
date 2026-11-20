import assert from 'node:assert/strict';
import {startPrivateReportServer} from './private-server-entry.mjs';
let checks=0;
async function reject(label,options,pattern){
 await assert.rejects(()=>startPrivateReportServer(options),pattern,label);
 checks++;
}
const valid={
 REPORT_API_ENABLED:'true',
 REPORT_API_PROJECT_ID:'imile-management-staging',
 REPORT_API_ALLOWED_ORIGIN:'https://imile-management-staging--imile-qa-op4483vh.web.app',
 PORT:'43900',
 REPORT_API_BIND:'127.0.0.1'
};
const fakeAdmin=async()=>({db:{doc:()=>({}),runTransaction:async()=>{}},
 verifyIdToken:async()=>({uid:'admin'})});
await reject('disabled by default',{env:{},adminFactory:fakeAdmin},/not authorized/);
await reject('rejects wrong Firebase project',{env:{...valid,REPORT_API_PROJECT_ID:'production'},adminFactory:fakeAdmin},/Only the separate staging/);
await reject('rejects insecure origin',{env:{...valid,REPORT_API_ALLOWED_ORIGIN:'http://localhost:3000'},adminFactory:fakeAdmin},/HTTPS origin/);
await reject('rejects invalid port',{env:{...valid,PORT:'99'},adminFactory:fakeAdmin},/private server port/);
await reject('rejects public bind without ingress approval',{env:{...valid,REPORT_API_BIND:'0.0.0.0'},adminFactory:fakeAdmin},/Private ingress/);
await reject('rejects arbitrary public bind address',{env:{...valid,REPORT_API_BIND:'8.8.8.8'},adminFactory:fakeAdmin},/Invalid bind/);
let serverHandler=null,started=false;
const fakeServerFactory=handler=>{
 serverHandler=handler;
 return {
  once(event,callback){assert.equal(event,'error');assert.equal(typeof callback,'function');return this;},
  listen(port,bind,callback){
   assert.equal(port,43900);assert.equal(bind,'127.0.0.1');
   started=true;callback();return this;
  }
 };
};
const launched=await startPrivateReportServer({
 env:valid,adminFactory:fakeAdmin,serverFactory:fakeServerFactory});
assert.equal(launched.projectId,'imile-management-staging');
assert.ok(started);assert.equal(typeof serverHandler,'function');checks++;
console.log('PASS: '+checks+' private server deployment guard and adapter creation cases');
