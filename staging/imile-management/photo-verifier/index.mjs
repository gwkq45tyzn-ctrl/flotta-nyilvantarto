import {initializeApp,getApps} from 'firebase-admin/app';
import {onObjectFinalized,onObjectDeleted,onObjectMetadataUpdated} from 'firebase-functions/v2/storage';
import {logger} from 'firebase-functions';
import {verifyEvent,BUCKET} from './verifier.mjs';
import {serverAdapters} from './adapters.mjs';
export {attendancePhotoPermit} from './quota-callable.mjs';
const options={bucket:BUCKET,region:'europe-west3',memory:'1GiB',cpu:1,
 concurrency:1,minInstances:0,maxInstances:2,timeoutSeconds:120,retry:true,
 serviceAccount:'attendance-photo-verifier@imile-management-staging.iam.gserviceaccount.com'};
let adapters;
export async function handlePhotoEvent(event){
 const project=process.env.GCLOUD_PROJECT;
 if(process.env.FUNCTIONS_EMULATOR==='true'){
  if(!project?.startsWith('demo-')||!['FIRESTORE_EMULATOR_HOST','FIREBASE_AUTH_EMULATOR_HOST','STORAGE_EMULATOR_HOST'].every(k=>/^(http:\/\/)?127\.0\.0\.1:\d+$/.test(process.env[k]||'')))throw Error('LOOPBACK_EMULATORS_REQUIRED');
 }else if(project!=='imile-management-staging')throw Error('STAGING_PROJECT_REQUIRED');
 adapters??=serverAdapters(getApps()[0]||initializeApp());
 let result;
 try{result=await verifyEvent(event,adapters);}
 catch{
  // SDK error messages may contain private object names. Retry without logging
  // the original message, response, path or nested cause.
  logger.warn('attendance_photo_verification_retry');throw Error('PHOTO_VERIFICATION_RETRY');
 }
 // No photo data, UID, object paths, URLs, credentials or personal information.
 logger.info('attendance_photo_verification',{status:result.status,code:result.code||''});
 return result;
}
export const attendancePhotoFinalized=onObjectFinalized(options,handlePhotoEvent);
export const attendancePhotoDeleted=onObjectDeleted(options,handlePhotoEvent);
export const attendancePhotoMetadata=onObjectMetadataUpdated(options,handlePhotoEvent);
