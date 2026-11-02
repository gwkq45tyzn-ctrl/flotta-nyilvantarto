import {randomBytes} from 'node:crypto';
import {Timestamp} from 'firebase-admin/firestore';
import {PERMIT_SOURCE,SID,ID,UID,DA,QuotaError,deny,exact,validatePolicy,dayKey,hash,counterKeys,counter,assertCapacity,ms,validPermit} from './quota-policy.mjs';

/** Server-only capability issuer. One active capability is embedded in
 * courierAccess so Storage can retain PR58 checks within its TWO-document cap.
 * No path, UID, DA, day, clock, quota or role supplied by a courier is trusted.
 */
export class PhotoQuotaService{
 constructor({db,auth,now=Date.now}){this.db=db;this.auth=auth;this.now=now;}
 ref(path){return this.db.doc(path);}
 async account(uid){if(!UID.test(uid||''))deny('ACCOUNT_DENIED');let a;
  try{a=await this.auth.getUser(uid);}catch(e){if(e.code==='auth/user-not-found')deny('ACCOUNT_DENIED');throw e;}
  if(a.disabled)deny('ACCOUNT_DENIED');return a;
 }
 async handle(uid,data){
  await this.account(uid);
  const actions={begin:['action','requestId'],checkout:['action','sessionId'],adminGrant:['action','operationId','targetUid','amount','reason'],adminRevoke:['action','operationId','targetUid','sessionId','reason'],adminResume:['action','operationId','targetUid','sessionId','reason'],adminPolicy:['action','operationId','expectedRevision','policy','reason']};
  if(typeof data?.action!=='string'||!Object.hasOwn(actions,data.action))deny('INVALID_REQUEST');exact(data,actions[data.action]);
  if(data.action==='begin'&&(typeof data.requestId!=='string'||!ID.test(data.requestId)))deny('INVALID_REQUEST');
  if(data.action==='checkout'&&(typeof data.sessionId!=='string'||!SID.test(data.sessionId)))deny('INVALID_REQUEST');
  if(data.action.startsWith('admin')){
   if(typeof data.operationId!=='string'||!ID.test(data.operationId)||typeof data.reason!=='string'||data.reason.trim().length<10||data.reason.length>500)deny('INVALID_REQUEST');
   if(['adminRevoke','adminResume'].includes(data.action)&&(typeof data.sessionId!=='string'||!SID.test(data.sessionId)))deny('INVALID_REQUEST');
   const actor=(await this.ref('users/'+uid).get()).data();
   if(actor?.role!=='admin'||actor.active!==true)deny('ADMIN_REQUIRED');
   if(data.action!=='adminPolicy'&&(typeof data.targetUid!=='string'||!UID.test(data.targetUid)))deny('INVALID_REQUEST');
   if(['adminGrant','adminResume'].includes(data.action))await this.account(data.targetUid);
   return this.admin(uid,data);
  }
  return this.courier(uid,data);
 }
 async courierAccess(tx,uid,{requireActive=true}={}){
  const access=(await tx.get(this.ref('courierAccess/'+uid))).data();
  if(!access||requireActive&&access.active!==true||access.uid!==uid||!DA.test(access.driverId||''))deny('COURIER_DENIED');
  if(requireActive){const driver=(await tx.get(this.ref('drivers/'+access.driverId))).data();if(driver?.active!==true)deny('DRIVER_INACTIVE');}
  return access;
 }
 async locks(tx,uid,driverId){return Promise.all(['courierLocks/'+uid,'driverLocks/'+driverId].map(p=>tx.get(this.ref(p))));}
 async ensureNoCar(tx,uid,driverId){if((await this.locks(tx,uid,driverId)).some(s=>s.exists))deny('VEHICLE_STILL_LOCKED');}
 async policy(tx){const p=(await tx.get(this.ref('photoUploadPolicy/current'))).data();if(!p)deny('POLICY_NOT_CONFIGURED');validatePolicy(p);if(!p.enabled)deny('UPLOADS_DISABLED');return p;}
 response(p,stage,reused){return {uid:p.uid,driverId:p.driverId,sessionId:p.sessionId,source:p.source,requestId:p.requestId,stage,expiresAt:ms(stage==='in'?p.inExpiresAt:p.outExpiresAt),reused};}
 async courier(uid,data){
  const candidate='s_'+randomBytes(16).toString('hex');
  return this.db.runTransaction(async tx=>{
   const now=this.now(),p=await this.policy(tx),access=await this.courierAccess(tx,uid),driverId=access.driverId;
   const current=access.photoUploadPermit,accessRef=this.ref('courierAccess/'+uid),leaseRef=this.ref('photoUploadLeases/'+driverId);
   if(data.action==='checkout'){
    if(!current||current.sessionId!==data.sessionId||current.uid!==uid||current.driverId!==driverId||current.status!=='open')deny('PERMIT_MISSING');
    const s=(await tx.get(this.ref('vehicleSessions/'+data.sessionId))).data();
    if(s?.uid!==uid||s.driverId!==driverId||s.status!=='active'||!/^[A-Z0-9]{4,12}$/.test(s.plate||''))deny('CHECKOUT_NOT_ACTIVE');
    const [courier,da]=await this.locks(tx,uid,driverId),car=await tx.get(this.ref('vehicleLocks/'+s.plate));
    for(const x of [courier,da,car])if(!x?.exists||x.data().sessionId!==data.sessionId||x.data().plate!==s.plate||x.data().state!=='active')deny('LOCK_MISMATCH');
    if(da.data().uid!==uid||car.data().uid!==uid||da.data().driverId!==driverId||car.data().driverId!==driverId)deny('LOCK_MISMATCH');
    if(validPermit(current,uid,driverId,data.sessionId,'out',now))return this.response(current,'out',true);
    const renewed={...current,outExpiresAt:Timestamp.fromMillis(now+p.permitTtlMinutes*60000)};
    tx.update(accessRef,{photoUploadPermit:renewed});tx.update(this.ref('photoUploadPermits/'+data.sessionId),{outExpiresAt:renewed.outExpiresAt});
    return this.response(renewed,'out',true);
   }
   // Stable request journal survives lost responses and even completed drives.
   // A journal replay can NEVER silently allocate a fresh quota entry.
   const requestRef=this.ref('photoUploadRequests/'+hash(uid+':'+data.requestId));
   const request=(await tx.get(requestRef)).data(),lease=(await tx.get(leaseRef)).data();
   await this.ensureNoCar(tx,uid,driverId);
   let active=current,session;
   if(lease){
    session=(await tx.get(this.ref('vehicleSessions/'+lease.sessionId))).data();
    if(session&&!['reviewed'].includes(session.status))deny('VEHICLE_STILL_LOCKED');
    if(!session&&lease.resumeUntil?.toMillis()>now&&lease.status==='open'&&lease.uid!==uid)deny('DA_UPLOAD_IN_PROGRESS');
   }
   if(request&&(!active||active.sessionId!==request.sessionId))deny('REQUEST_ALREADY_FINISHED');
   if(active&&active.uid===uid&&active.driverId===driverId&&active.status==='open'&&!session&&ms(active.resumeUntil)>now){
    if(lease?.uid!==uid||lease.sessionId!==active.sessionId||lease.status!=='open')deny('LEASE_INCONSISTENT');
    const expires=validPermit(active,uid,driverId,active.sessionId,'in',now);
    if(expires&&request)return this.response(active,'in',true);
    if(!request){
     if(!Number.isInteger(active.requestCount)||active.requestCount>=p.maxRequestAliases)deny('TOO_MANY_REQUEST_ALIASES');
     active={...active,requestCount:active.requestCount+1};
     tx.create(requestRef,{uid,driverId,sessionId:active.sessionId,createdAt:Timestamp.fromMillis(now)});
    }
    active={...active,inExpiresAt:expires?active.inExpiresAt:Timestamp.fromMillis(Math.min(now+p.permitTtlMinutes*60000,ms(active.resumeUntil)))};
    tx.update(accessRef,{photoUploadPermit:active});tx.update(this.ref('photoUploadPermits/'+active.sessionId),{inExpiresAt:active.inExpiresAt,requestCount:active.requestCount});
    return this.response(active,'in',true);
   }
   if(request)deny('PERMIT_EXPIRED_OR_FINISHED');
   const day=dayKey(now),keys=counterKeys(day,uid,driverId),refs=keys.map(k=>this.ref('photoUploadQuotas/'+k));
   const values=await Promise.all(refs.map(r=>tx.get(r))),u=counter(values[0].data()),d=counter(values[1].data());assertCapacity(u,d,p);
   const grant={source:PERMIT_SOURCE,version:1,status:'open',uid,driverId,sessionId:candidate,requestId:data.requestId,requestCount:1,quotaDay:day,policyRevision:p.revision,
    createdAt:Timestamp.fromMillis(now),inExpiresAt:Timestamp.fromMillis(now+p.permitTtlMinutes*60000),outExpiresAt:Timestamp.fromMillis(0),resumeUntil:Timestamp.fromMillis(now+p.resumeHours*3600000)};
   if(current){const closed={...current,status:session?'completed':current.status==='revoked'?'revoked':'expired'};
    tx.update(this.ref('photoUploadPermits/'+current.sessionId),{status:closed.status});}
   tx.set(refs[0],{...u,used:u.used+1,day,kind:'uid'});tx.set(refs[1],{...d,used:d.used+1,day,kind:'da'});
   tx.create(this.ref('photoUploadPermits/'+candidate),grant);tx.create(requestRef,{uid,driverId,sessionId:candidate,createdAt:grant.createdAt});
   tx.update(accessRef,{photoUploadPermit:grant});tx.set(leaseRef,{uid,sessionId:candidate,resumeUntil:grant.resumeUntil,status:'open'});
   return this.response(grant,'in',false);
  });
 }
 async admin(actor,data){
  const fingerprint=hash(JSON.stringify({actor,...data},(_key,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v));
  return this.db.runTransaction(async tx=>{
   const now=this.now(),actorRecord=(await tx.get(this.ref('users/'+actor))).data();
   if(actorRecord?.role!=='admin'||actorRecord.active!==true)deny('ADMIN_REQUIRED');
   const auditRef=this.ref('photoUploadAdminOps/'+data.operationId),old=(await tx.get(auditRef)).data();
   if(old){if(old.fingerprint!==fingerprint)deny('OPERATION_ID_REUSED');return {...old.result,replayed:true};}
   const audit={actorUid:actor,action:data.action,reason:data.reason.trim(),fingerprint,at:Timestamp.fromMillis(now)};
   let result;
   if(data.action==='adminPolicy'){
    validatePolicy(data.policy);
    const ref=this.ref('photoUploadPolicy/current'),prior=(await tx.get(ref)).data();
    if(!Number.isInteger(data.expectedRevision)||data.expectedRevision!==(prior?.revision||0)||data.policy.revision!==data.expectedRevision+1)deny('POLICY_REVISION_CONFLICT');
    tx.set(ref,data.policy);result={revision:data.policy.revision};audit.before=prior||null;audit.after=data.policy;
   }else{
    const p=await this.policy(tx),access=await this.courierAccess(tx,data.targetUid,{requireActive:data.action!=='adminRevoke'}),driverId=access.driverId;
    audit.targetUid=data.targetUid;audit.driverId=driverId;
    if(data.action==='adminGrant'){
     if(!Number.isInteger(data.amount)||data.amount<1||data.amount>p.maxAdminExtraPerDay)deny('INVALID_EXTRA');
     const day=dayKey(now),refs=counterKeys(day,data.targetUid,driverId).map(k=>this.ref('photoUploadQuotas/'+k));
     const prior=await Promise.all(refs.map(r=>tx.get(r))),values=prior.map(s=>counter(s.data()));
     if(values.some(v=>v.extra+data.amount>p.maxAdminExtraPerDay))deny('ADMIN_EXTRA_LIMIT');
     values.forEach((v,i)=>tx.set(refs[i],{...v,extra:v.extra+data.amount,day,kind:i===0?'uid':'da'}));
     result={day,extraGranted:data.amount};audit.before=values;audit.after=values.map(v=>({...v,extra:v.extra+data.amount}));
    }else{
     if(!SID.test(data.sessionId||''))deny('INVALID_REQUEST');
     const current=access.photoUploadPermit;if(!current||current.sessionId!==data.sessionId||current.uid!==data.targetUid||current.driverId!==driverId)deny('PERMIT_MISSING');
     const session=await tx.get(this.ref('vehicleSessions/'+data.sessionId));if(session.exists)deny('SESSION_ALREADY_CREATED');
     await this.ensureNoCar(tx,data.targetUid,driverId);
     const leaseRef=this.ref('photoUploadLeases/'+driverId),lease=(await tx.get(leaseRef)).data();
     if(lease?.uid!==data.targetUid&&lease?.status==='open'&&ms(lease.resumeUntil)>now)deny('DA_UPLOAD_IN_PROGRESS');
     const grant={...current,status:data.action==='adminRevoke'?'revoked':'open'};
     if(data.action==='adminResume'){
      grant.resumeUntil=Timestamp.fromMillis(now+p.resumeHours*3600000);grant.inExpiresAt=Timestamp.fromMillis(now+p.permitTtlMinutes*60000);
     }
     audit.before={status:current.status,inExpiresAt:current.inExpiresAt,resumeUntil:current.resumeUntil};
     tx.update(this.ref('courierAccess/'+data.targetUid),{photoUploadPermit:grant});tx.update(this.ref('photoUploadPermits/'+data.sessionId),grant);
     if(data.action==='adminRevoke'){if(lease?.sessionId===data.sessionId)tx.update(leaseRef,{status:'revoked'});}
     else tx.set(leaseRef,{uid:data.targetUid,sessionId:data.sessionId,status:'open',resumeUntil:grant.resumeUntil});
     result={sessionId:data.sessionId,status:grant.status};audit.after={status:grant.status,inExpiresAt:grant.inExpiresAt,resumeUntil:grant.resumeUntil};
    }
   }
   tx.create(auditRef,{...audit,result});return result;
  });
 }
}
