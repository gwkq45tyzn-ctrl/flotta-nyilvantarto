/**
 * Framework-neutral, server-only HTTP API for iMile report snapshots.
 * Firebase Auth Admin verifyIdToken and Admin Firestore are REQUIRED adapters.
 * This file is intentionally not included in the Firebase Hosting preview.
 *
 * A server must inject a verified Firebase project and enforce its own ingress
 * controls. This API verifies aggregate consistency, NOT original source data.
 */
import {archiveId,commitTrustedReport,reportKey} from './trusted-report-validation.mjs';

const MAX_JSON_BYTES=512*1024;
const response=(code,body,origin)=>new Response(JSON.stringify(body),{
 status:code,headers:{'Content-Type':'application/json; charset=utf-8',
 'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',
 'Vary':'Origin',...(origin?{'Access-Control-Allow-Origin':origin}:{} )}});
const kinds={ofd:['performanceDays','performanceVersions'],inhub:['inventoryDays','inventoryVersions']};
const fail=(status,error,origin)=>response(status,{error},origin);
const msg=e=>String(e?.message||'internal_error').slice(0,100);
const trustedError=e=>/^invalid_|^untrusted_|^duplicate_|^replacement_|^cannot_|^report_status_|^inventory_has_|^previous_|^unexpected_|^history_revision_|^server_auth_|^station_key_|^source_/.test(msg(e));
const parseBearer=value=>typeof value==='string'&&/^Bearer [A-Za-z0-9._~+/-]{20,4096}$/.test(value)
 ?value.slice(7):null;
async function readBody(req){
 if(req.headers.get('content-type')?.split(';')[0]?.trim()!=='application/json')
  throw Error('invalid_media_type');
 const length=req.headers.get('content-length');
 if(length!==null&&(!/^\d+$/.test(length)||Number(length)>MAX_JSON_BYTES))
  throw Error('invalid_body_size');
 if(!req.body)throw Error('invalid_body_size');
 const reader=req.body.getReader(),chunks=[];let size=0;
 try{
  for(;;){
   const {done,value}=await reader.read();
   if(done)break;
   size+=value.byteLength;
   if(size>MAX_JSON_BYTES)throw Error('invalid_body_size');
   chunks.push(value);
  }
 }finally{reader.releaseLock();}
 if(size===0)throw Error('invalid_body_size');
 const data=new Uint8Array(size);let offset=0;
 for(const chunk of chunks){data.set(chunk,offset);offset+=chunk.byteLength;}
 let json;
 try{json=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(data));}
 catch{throw Error('invalid_json');}
 if(!json||Array.isArray(json)||typeof json!=='object')throw Error('invalid_json');
 return json;
}
const keys=(x,expected)=>x&&typeof x==='object'&&!Array.isArray(x)&&
 Object.keys(x).length===expected.length&&expected.every(k=>Object.hasOwn(x,k));

/**
 * @param config { db: FirebaseAdminFirestore, verifyIdToken: async(token)=>{uid},
 *   allowedOrigin: exact HTTPS origin, projectId: expected Firebase project ID }
 */
export function createReportApi({db,verifyIdToken,allowedOrigin,projectId}={}){
 if(!db||typeof db.doc!=='function'||typeof db.runTransaction!=='function'||
  typeof verifyIdToken!=='function'||!allowedOrigin?.startsWith('https://')||
  !/^https:\/\/[A-Za-z0-9.-]+(?::\d{2,5})?$/.test(allowedOrigin)||
  projectId!=='imile-management-staging')throw Error('server_setup_incomplete');
 return async function handleReportRequest(req){
  let origin=null;
  const incomingOrigin=req.headers.get('origin');
  if(incomingOrigin!==null){
   if(incomingOrigin!==allowedOrigin)return fail(403,'origin_forbidden',null);
   origin=allowedOrigin;
  }
  if(req.method==='OPTIONS'){
   return new Response(null,{status:204,headers:{
    'Cache-Control':'no-store','Access-Control-Allow-Origin':allowedOrigin,
    'Access-Control-Allow-Methods':'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers':'Authorization,Content-Type',
    'Access-Control-Max-Age':'600','Vary':'Origin'}});
  }
  let url;
  try{url=new URL(req.url);}catch{return fail(400,'invalid_request_url',origin);}
  if(!['POST','GET'].includes(req.method))return fail(405,'method_not_allowed',origin);
  if(!['/v1/reports/save','/v1/reports/version'].includes(url.pathname))
   return fail(404,'not_found',origin);
  const token=parseBearer(req.headers.get('authorization'));
  if(!token)return fail(401,'bearer_required',origin);
  let uid;
  try{
   const verified=await verifyIdToken(token,true);
   uid=verified?.uid;
   if(typeof uid!=='string'||!uid.length||uid.length>128)throw Error('bad_token');
  }catch{return fail(401,'invalid_auth_token',origin);}
  if(req.method==='GET'){
   if(url.pathname!=='/v1/reports/version')return fail(405,'method_not_allowed',origin);
   const kind=url.searchParams.get('kind'),date=url.searchParams.get('date'),
    station=url.searchParams.get('station'),rawVersion=url.searchParams.get('version');
   if(!Object.hasOwn(kinds,kind)||!/^[1-9]\d{0,5}$/.test(rawVersion||''))
    return fail(400,'invalid_history_query',origin);
   let key,version;
   try{key=reportKey(date,station);version=Number(rawVersion);}catch{
    return fail(400,'invalid_history_query',origin);
   }
   try{
    const member=await db.doc('users/'+uid).get();
    const profile=member.exists?member.data():null;
    if(!profile||profile.active!==true||!['admin','editor','viewer'].includes(profile.role))
     return fail(403,'membership_required',origin);
    const snap=await db.doc(kinds[kind][1]+'/'+archiveId(key,version)).get();
    if(!snap.exists)return fail(404,'version_not_found',origin);
    const record=snap.data();
    if(record.key!==key||record.version!==version)
     return fail(409,'history_integrity_failed',origin);
    return response(200,{version:record,sourceValidation:
     record.unverifiedLegacy||record.validationSource==='legacy-unverified'
      ?'legacy-unverified':'server-aggregate-checked-not-source-attested'},origin);
   }catch{return fail(503,'storage_unavailable',origin);}
  }
  if(url.pathname!=='/v1/reports/save')return fail(405,'method_not_allowed',origin);
  let body;
  try{body=await readBody(req);}
  catch(e){return fail(e.message==='invalid_media_type'?415:400,msg(e),origin);}
  if(!keys(body,['kind','candidate','status','allowReplace','expectedVersion','sourceName'])||
   !Object.hasOwn(kinds,body.kind)||typeof body.allowReplace!=='boolean'||
   !(body.expectedVersion===null||
    (Number.isSafeInteger(body.expectedVersion)&&body.expectedVersion>=0))||
   !(body.status===null||['provisional','final'].includes(body.status))||
   typeof body.sourceName!=='string')
   return fail(400,'invalid_save_envelope',origin);
  try{
   const saved=await commitTrustedReport({db,verifiedUid:uid,kind:body.kind,
    candidate:body.candidate,status:body.status,allowReplace:body.allowReplace,
    expectedVersion:body.expectedVersion,sourceName:body.sourceName});
   return response(200,{result:saved,sourceValidation:'server-aggregate-checked-not-source-attested'},origin);
  }catch(e){
   const error=msg(e);
   const denied=error==='report_write_forbidden'||error==='server_auth_required';
   const conflict=error==='replacement_not_approved'||error==='cannot_downgrade_final'||
    error==='history_revision_already_exists'||error==='unexpected_version';
   return fail(denied?403:conflict?409:trustedError(e)?422:503,
    trustedError(e)||denied?error:'save_failed',origin);
  }
 };
}
