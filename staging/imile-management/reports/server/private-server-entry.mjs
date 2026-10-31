/**
 * Private deployment adapter – does not ship to Firebase Hosting.
 * DO NOT execute until a private server/Cloud Run + company data-processing
 * approval and official Firebase Admin SDK dependency installation exist.
 * No credentials, API tokens or private user records are embedded here.
 */
import {createServer} from 'node:http';
import {Readable} from 'node:stream';
import {createReportApi} from './report-http-api.mjs';

export async function startPrivateReportServer({
 env=process.env,adminFactory=null,serverFactory=createServer
}={}){
 if(env.REPORT_API_ENABLED!=='true')throw Error('Report API not authorized for launch');
 if(env.REPORT_API_PROJECT_ID!=='imile-management-staging')
  throw Error('Only the separate staging Firebase project is supported');
 const origin=env.REPORT_API_ALLOWED_ORIGIN;
 if(!/^https:\/\/[a-zA-Z0-9.-]+(?::\d{2,5})?$/.test(origin||''))
  throw Error('Allowed HTTPS origin not configured');
 const port=Number(env.PORT||8080);
 if(!Number.isSafeInteger(port)||port<1024||port>65535)throw Error('Invalid private server port');
 const bind=env.REPORT_API_BIND||'127.0.0.1';
 if(!['127.0.0.1','0.0.0.0'].includes(bind))throw Error('Invalid bind address');
 if(bind==='0.0.0.0'&&env.REPORT_API_PRIVATE_INGRESS_CONFIRMED!=='true')
  throw Error('Private ingress must be explicitly confirmed');
 if(!adminFactory){
  // Production install must be provisioned by an authorized maintainer.
  // Application Default Credentials only; never browser credentials.
  const [appSdk,authSdk,storeSdk]=await Promise.all([
   import('firebase-admin/app'),import('firebase-admin/auth'),import('firebase-admin/firestore')
  ]);
  adminFactory=()=>{
   const app=appSdk.initializeApp({
    credential:appSdk.applicationDefault(),projectId:'imile-management-staging'
   });
   return {db:storeSdk.getFirestore(app),verifyIdToken:(token,checkRevoked)=>
    authSdk.getAuth(app).verifyIdToken(token,checkRevoked)};
  };
 }
 const {db,verifyIdToken}=await adminFactory();
 const handler=createReportApi({
  db,verifyIdToken,allowedOrigin:origin,projectId:'imile-management-staging'
 });
 const server=serverFactory(async(req,res)=>{
  try{
   // The actual ingress/proxy must terminate HTTPS and enforce rate limits,
   // max body size and firewall restrictions. This listener is HTTP only.
   const headers=new Headers();
   for(const [name,value]of Object.entries(req.headers))
    if(value!==undefined)headers.set(name,Array.isArray(value)?value.join(', '):value);
   const method=req.method||'GET';
   const request=new Request('https://internal.report-api.invalid'+(req.url||'/'),{
    method,headers,
    ...(['POST','PUT','PATCH'].includes(method)?{
     body:Readable.toWeb(req),duplex:'half'
    }:{})
   });
   const result=await handler(request);
   res.writeHead(result.status,Object.fromEntries(result.headers));
   res.end(Buffer.from(await result.arrayBuffer()));
  }catch{
   res.writeHead(503,{'Content-Type':'application/json','Cache-Control':'no-store'});
   res.end('{"error":"api_unavailable"}');
  }
 });
 await new Promise((resolve,reject)=>{
  server.once('error',reject);
  server.listen(port,bind,resolve);
 });
 return {server,bind,port,projectId:'imile-management-staging'};
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href){
 try{
  const result=await startPrivateReportServer();
  console.log('Private iMile report API listening on '+result.bind+':'+result.port);
 }catch(error){
  console.error('Private API launch denied:',error.message);
  process.exitCode=1;
 }
}
