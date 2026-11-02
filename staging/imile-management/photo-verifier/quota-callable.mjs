import {getApps,initializeApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {getAuth} from 'firebase-admin/auth';
import {HttpsError,onCall} from 'firebase-functions/v2/https';
import {logger} from 'firebase-functions';
import {PhotoQuotaService} from './quota-service.mjs';
import {QuotaError} from './quota-policy.mjs';
export function assertQuotaRuntime(){
 if(process.env.FUNCTIONS_EMULATOR==='true'){
  if(!process.env.GCLOUD_PROJECT?.startsWith('demo-')||!['FIRESTORE_EMULATOR_HOST','FIREBASE_AUTH_EMULATOR_HOST'].every(k=>/^127\.0\.0\.1:\d+$/.test(process.env[k]||'')))throw Error('LOOPBACK_EMULATORS_REQUIRED');
 }else if(process.env.GCLOUD_PROJECT!=='imile-management-staging')throw Error('STAGING_PROJECT_REQUIRED');
}
export async function handlePhotoPermit(request){
 assertQuotaRuntime();
 if(!request.auth?.uid)throw new HttpsError('unauthenticated','AUTH_REQUIRED');
 const app=getApps()[0]||initializeApp(),auth=getAuth(app);
 try{
  // Callable token verification alone does not check revocation/disabled users.
  const header=request.rawRequest.headers.authorization||'';
  if(!header.startsWith('Bearer '))throw new HttpsError('unauthenticated','AUTH_REQUIRED');
  const token=await auth.verifyIdToken(header.slice(7),true);
  if(token.uid!==request.auth.uid)throw new HttpsError('unauthenticated','AUTH_REQUIRED');
  return await new PhotoQuotaService({db:getFirestore(app),auth}).handle(token.uid,request.data);
 }catch(e){
  if(e instanceof HttpsError)throw e;
  if(e instanceof QuotaError){
   const code=e.code==='DAILY_QUOTA_EXHAUSTED'||e.code==='TOO_MANY_REQUEST_ALIASES'?'resource-exhausted':
    ['ADMIN_REQUIRED','COURIER_DENIED','ACCOUNT_DENIED'].includes(e.code)?'permission-denied':
    e.code.startsWith('INVALID')?'invalid-argument':'failed-precondition';
   throw new HttpsError(code,e.code);
  }
  if(String(e.code||'').startsWith('auth/'))throw new HttpsError('unauthenticated','AUTH_REQUIRED');
  logger.warn('attendance_photo_permit_retry');throw new HttpsError('unavailable','PERMIT_SERVICE_RETRY');
 }
}
// Authenticated callable transport is intentionally distinct from the private
// Eventarc verifier. It NEVER issues a photo receipt or bypasses image checks.
export const attendancePhotoPermit=onCall({region:'europe-west3',memory:'256MiB',cpu:1,
 concurrency:10,minInstances:0,maxInstances:2,timeoutSeconds:60,
 serviceAccount:'attendance-photo-quota@imile-management-staging.iam.gserviceaccount.com',
 cors:process.env.FUNCTIONS_EMULATOR==='true'?true:[/^https:\/\/imile-management-staging-app\.(web\.app|firebaseapp\.com)$/,/^https:\/\/imile-management-staging--imile-qa-[a-z0-9]+\.web\.app$/]
},handlePhotoPermit);
