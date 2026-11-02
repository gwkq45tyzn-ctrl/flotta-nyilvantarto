import {createHash} from 'node:crypto';
export const PROJECT='imile-management-staging',REGION='europe-west3',BUCKET=PROJECT+'.firebasestorage.app';
export const APPROVALS=Object.freeze({billing:false,deployment:false,iam:false,appCheck:false,retention:false,policy:false,pilotPeople:false,stopOwner:false});
const services=['firestore.googleapis.com','firebasestorage.googleapis.com','storage.googleapis.com','cloudfunctions.googleapis.com','run.googleapis.com','eventarc.googleapis.com','pubsub.googleapis.com','cloudbuild.googleapis.com','artifactregistry.googleapis.com','firebaseappcheck.googleapis.com','recaptchaenterprise.googleapis.com','identitytoolkit.googleapis.com'];
const status=r=>r.http===200?'OBSERVED':r.http===404?'NOT_FOUND':'UNKNOWN';
const safeRole=r=>typeof r==='string'&&/^(roles\/[A-Za-z0-9.]+|projects\/imile-management-staging\/roles\/[A-Za-z0-9_]+)$/.test(r);
export async function inspectPilot(read,{approvals=APPROVALS}={}){
 // read accepts ONLY fixed GET resources and getIamPolicy POSTs (read-only).
 const evidence=[];
 async function get(name,url,body){
  let r;try{r=await read(url,body);}catch{r={http:0,data:{}};}
  evidence.push({name,http:r.http,status:status(r),error:r.data?.error?.status});return r;
 }
 const project=await get('project','https://cloudresourcemanager.googleapis.com/v1/projects/'+PROJECT);
 const number=project.http===200&&/^\d+$/.test(project.data.projectNumber)?project.data.projectNumber:null;
 const roots=await Promise.all([
  get('billing','https://cloudbilling.googleapis.com/v1/projects/'+PROJECT+'/billingInfo'),
  get('buckets','https://storage.googleapis.com/storage/v1/b?project='+PROJECT+'&fields=items(name,location,iamConfiguration,retentionPolicy,softDeletePolicy,lifecycle),nextPageToken'),
  get('firestore','https://firestore.googleapis.com/v1/projects/'+PROJECT+'/databases/(default)'),
  get('rules','https://firebaserules.googleapis.com/v1/projects/'+PROJECT+'/releases?pageSize=100'),
  get('functions','https://cloudfunctions.googleapis.com/v2/projects/'+PROJECT+'/locations/'+REGION+'/functions'),
  get('projectIAM','https://cloudresourcemanager.googleapis.com/v1/projects/'+PROJECT+':getIamPolicy',{options:{requestedPolicyVersion:3}})
 ]);
 const [billing,buckets,database,rules,functions,iam]=roots;
 const identities=['attendance-photo-verifier','attendance-photo-quota'].map(n=>n+'@'+PROJECT+'.iam.gserviceaccount.com');
 const deployed=functions.http===200?(functions.data.functions||[]):[];
 const triggers=[...new Set(deployed.filter(f=>/attendancePhoto(Deleted|Finalized|Metadata)$/.test(f.name||'')).map(f=>f.eventTrigger?.serviceAccountEmail).filter(Boolean))];
 for(const identity of triggers)if(!identities.includes(identity))identities.push(identity);
 if(number)identities.push(...['gcp-sa-eventarc','gcp-sa-cloudfunctions','gs-project-accounts','gcp-sa-firebasestorage','gcp-sa-firebaseappcheck','gcp-sa-pubsub','gcp-sa-cloudbuild','gcp-sa-artifactregistry','firebase-rules'].map(agent=>'service-'+number+'@'+agent+'.iam.gserviceaccount.com'));
 const accounts=await Promise.all(identities.map(async email=>{
  const response=await get('identity:'+email,'https://iam.googleapis.com/v1/projects/'+PROJECT+'/serviceAccounts/'+encodeURIComponent(email));
  const bindings=iam.http===200?(iam.data.bindings||[]).filter(b=>b.members?.includes('serviceAccount:'+email)):[];
  return {identity:email,status:status(response),disabled:response.http===200?response.data.disabled===true:null,
   projectRoles:bindings.filter(b=>safeRole(b.role)).map(b=>({role:b.role,conditional:!!b.condition})),
   effectivePermissions:'UNKNOWN: inherited IAM, deny policies and resource conditions require owner review'};
 }));
 const apiStates=number?await Promise.all(services.map(async name=>{
  const r=await get('api:'+name,'https://serviceusage.googleapis.com/v1/projects/'+number+'/services/'+name);
  return {name,state:r.http===200?r.data.state:'UNKNOWN'};
 })):[];
 const roles=[...new Set(accounts.flatMap(a=>a.projectRoles.map(r=>r.role)))];
 const rolePermissions=await Promise.all(roles.map(async role=>{
  const r=await get('role:'+role,'https://iam.googleapis.com/v1/'+role);
  return {role,status:status(r),permissions:r.http===200?(r.data.includedPermissions||[]):null};
 }));
 const required={
  'attendance-photo-verifier':['storage.objects.get','firebaseauth.users.get','datastore.entities.get','datastore.entities.create','datastore.entities.update','datastore.databases.get','datastore.databases.getMetadata','logging.logEntries.create'],
  'attendance-photo-quota':['firebaseauth.users.get','datastore.entities.get','datastore.entities.create','datastore.entities.update','datastore.databases.get','datastore.databases.getMetadata','logging.logEntries.create']
 };
 const permissionChecks=Object.entries(required).map(([name,permissions])=>{
  const account=accounts.find(a=>a.identity.startsWith(name+'@'));
  const observed=new Set((account?.projectRoles||[]).filter(r=>!r.conditional).flatMap(r=>rolePermissions.find(p=>p.role===r.role)?.permissions||[]));
  return {identity:account.identity,required:permissions,notObservedAtProject:permissions.filter(p=>!observed.has(p)),effective:'UNKNOWN'};
 });
 const bucket=buckets.http===200?(buckets.data.items||[]).find(b=>b.name===BUCKET):null;
 let bucketPublic='UNKNOWN';
 if(bucket){
  const r=await get('bucketMetadata','https://storage.googleapis.com/storage/v1/b/'+BUCKET);
  const p=await get('bucketIAM','https://storage.googleapis.com/storage/v1/b/'+BUCKET+'/iam');
  bucketPublic=p.http===200?(p.data.bindings||[]).some(b=>b.members?.some(m=>['allUsers','allAuthenticatedUsers'].includes(m))):'UNKNOWN';
  if(r.http===200)Object.assign(bucket,{location:r.data.location,publicAccessPrevention:r.data.iamConfiguration?.publicAccessPrevention,
   uniformBucketLevelAccess:r.data.iamConfiguration?.uniformBucketLevelAccess?.enabled,
   softDeletePolicy:r.data.softDeletePolicy,lifecycle:r.data.lifecycle,retentionPolicy:r.data.retentionPolicy});
 }
 const runIAM=[];
 for(const f of deployed.filter(f=>/attendancePhoto(Deleted|Finalized|Metadata|Permit)$/.test(f.name||''))){
  const service=f.serviceConfig?.service;
  if(typeof service==='string'&&service.startsWith('projects/'+PROJECT+'/locations/'+REGION+'/services/')){
   const r=await get('runIAM:'+service.split('/').at(-1),'https://run.googleapis.com/v2/'+service+':getIamPolicy');
   runIAM.push({function:f.name.split('/').at(-1),runtimeIdentity:f.serviceConfig?.serviceAccountEmail||'UNKNOWN',status:status(r),
    publicInvoker:r.http===200?(r.data.bindings||[]).some(b=>b.role==='roles/run.invoker'&&b.members?.some(m=>['allUsers','allAuthenticatedUsers'].includes(m))):null,
    triggerIdentity:f.eventTrigger?.serviceAccountEmail||null});
  }
 }
 let appCheck='UNKNOWN';
 if(number){
  const r=await get('appCheck','https://firebaseappcheck.googleapis.com/v1/projects/'+number+'/apps/1:91967139054:web:37d68fd04cc9238e0857ff/recaptchaEnterpriseConfig');
  appCheck=r.http===200?(typeof r.data.siteKey==='string'&&r.data.siteKey?'CONFIG_PRESENT_REQUIRES_END_TO_END_PROOF':'PROVIDER_NOT_CONFIGURED'):status(r);
 }
 const releases=[];
 for(const release of rules.http===200?rules.data.releases||[]:[]){
  if(!/^projects\/imile-management-staging\/rulesets\/[A-Za-z0-9-]+$/.test(release.rulesetName||''))continue;
  const r=await get('ruleset','https://firebaserules.googleapis.com/v1/'+release.rulesetName);
  releases.push({name:release.name,updatedAt:release.updateTime,sha256:r.http===200?r.data.source?.files?.map(f=>createHash('sha256').update(f.content).digest('hex')):null});
 }
 const blockers=[];
 if(billing.http!==200||billing.data.billingEnabled!==true)blockers.push('BILLING_DISABLED_OR_UNKNOWN');
 if(!bucket)blockers.push(buckets.http===200&&!buckets.data.nextPageToken?'PHOTO_BUCKET_MISSING':'PHOTO_BUCKET_UNKNOWN');
 if(bucketPublic!==false)blockers.push('PRIVATE_BUCKET_NOT_PROVEN');
 if(database.http!==200||database.data.locationId!==REGION)blockers.push('FIRESTORE_REGION_NOT_PROVEN');
 if(functions.http!==200)blockers.push('FUNCTIONS_ACCESS_UNKNOWN');
 if(!triggers.length)blockers.push('EVENTARC_IDENTITY_NOT_IDENTIFIED');
 if(accounts.some(a=>a.status!=='OBSERVED'||a.disabled))blockers.push('RUNTIME_IDENTITIES_NOT_READY');
 if(apiStates.length!==services.length||apiStates.some(a=>a.state!=='ENABLED'))blockers.push('REQUIRED_APIS_NOT_PROVEN');
 if(runIAM.length!==4||runIAM.some(r=>r.status!=='OBSERVED'||r.function!=='attendancePhotoPermit'&&r.publicInvoker!==false))blockers.push('RUN_BOUNDARIES_NOT_PROVEN');
 blockers.push('EFFECTIVE_IAM_OWNER_REVIEW_REQUIRED','APPCHECK_END_TO_END_PROOF_REQUIRED','DEPLOYED_SOURCE_HASH_AND_RULES_MATCH_REQUIRED');
 for(const [name,approved]of Object.entries(APPROVALS))if(approvals[name]!==true)blockers.push('UNAPPROVED_'+name.toUpperCase());
 return {schemaVersion:1,observedAt:new Date().toISOString(),project:PROJECT,region:REGION,decision:'NO-GO',blockers,
  billingEnabled:billing.http===200?billing.data.billingEnabled:null,bucketCount:buckets.http===200&&!buckets.data.nextPageToken?(buckets.data.items||[]).length:null,
  bucket, bucketPublic,firestoreRegion:database.http===200?database.data.locationId:null,functionsKnown:functions.http===200,accounts,triggers,apiStates,permissionChecks,runIAM,appCheck,releases,evidence};
}
