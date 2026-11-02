import {createPublicKey,verify} from 'node:crypto';
import {getAppCheck} from 'firebase-admin/app-check';
export const WEB_APP_ID='1:91967139054:web:37d68fd04cc9238e0857ff';
export const QA_APP_ID='1:1234567890:web:syntheticattendance';
export function localAttestationRuntime(env=process.env){
 return env.FUNCTIONS_EMULATOR==='true'&&env.GCLOUD_PROJECT==='demo-imile-quota'&&
 ['FIRESTORE_EMULATOR_HOST','FIREBASE_AUTH_EMULATOR_HOST'].every(k=>/^127\.0\.0\.1:\d+$/.test(env[k]||''));
}
// The Functions emulator decodes App Check JWTs without verifying signatures.
// Never rely on that decoded context as proof. Local QA has its own ephemeral
// RSA authority; Google never trusts its key and production never accepts it.
export function verifyLocalAttestation(raw,key,{now=Date.now(),project='demo-imile-quota'}={}){
 if(typeof raw!=='string'||raw.length>8192)throw Error('APP_CHECK_REQUIRED');
 const parts=raw.split('.');if(parts.length!==3)throw Error('APP_CHECK_REQUIRED');
 const head=JSON.parse(Buffer.from(parts[0],'base64url')),token=JSON.parse(Buffer.from(parts[1],'base64url'));
 if(head.alg!=='RS256'||head.kid!=='synthetic-local-v1'||
 !verify('RSA-SHA256',Buffer.from(parts.slice(0,2).join('.')),createPublicKey(key),Buffer.from(parts[2],'base64url'))||
 token.iss!=='urn:imile:synthetic-local-appcheck'||token.aud?.length!==1||token.aud[0]!=='projects/'+project||
 token.sub!==QA_APP_ID||token.app_id!==QA_APP_ID||!Number.isInteger(token.exp)||!Number.isInteger(token.iat)||
 token.exp*1000<=now||token.iat*1000>now+30000||token.exp-token.iat>600)throw Error('APP_CHECK_REQUIRED');
 return {appId:token.sub};
}
export async function verifyAttestation(request,app){
 const localKey=process.env.ATTENDANCE_QA_APPCHECK_PUBLIC_KEY;
 const raw=request.rawRequest.headers['x-firebase-appcheck'];
 if(localAttestationRuntime()){
  if(!localKey)throw Error('APP_CHECK_REQUIRED');
  return verifyLocalAttestation(raw,Buffer.from(localKey,'base64').toString());
 }
 if(localKey||process.env.FUNCTIONS_EMULATOR==='true'||!request.app)throw Error('APP_CHECK_REQUIRED');
 const token=await getAppCheck(app).verifyToken(raw);
 if(token.app_id!==WEB_APP_ID||request.app.appId!==WEB_APP_ID)throw Error('APP_CHECK_REQUIRED');
 return {appId:token.app_id};
}
