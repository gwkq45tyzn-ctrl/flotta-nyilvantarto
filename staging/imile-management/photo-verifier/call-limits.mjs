import {createHash} from 'node:crypto';
import {DA,QuotaError} from './quota-policy.mjs';
export const SECURITY_EXAMPLE=Object.freeze({revision:1,uidPerMinute:60,uidBurst:10,daPerMinute:90,daBurst:15});
export function securityPolicy(value){
 const keys=['revision','uidPerMinute','uidBurst','daPerMinute','daBurst'];
 if(!value||Object.keys(value).length!==keys.length||!keys.every(k=>Number.isInteger(value[k])&&value[k]>=1&&value[k]<=(k==='revision'?1000000:10000)))throw Error('CALL_POLICY_NOT_CONFIGURED');
 return value;
}
export function debit(old,rate,burst,now,revision){
 const prior=old?.revision===revision&&Number.isFinite(old.tokens)&&Number.isFinite(old.at)?old:null;
 const at=Math.max(now,prior?.at||now),tokens=Math.min(burst,(prior?.tokens??burst)+Math.max(0,at-(prior?.at??at))*rate/60000);
 if(tokens<1)throw Error('CALL_RATE_LIMITED');
 return {tokens:tokens-1,at,revision};
}
// Bounded per-instance admission before token-revocation RPCs/Firestore.
// It is a load shedder, NOT a distributed financial cap.
export class Admission {
 constructor({now=Date.now,burst=40,perSecond=20,inFlight=10,maxKeys=2048}={}){Object.assign(this,{now,burst,perSecond,inFlight,maxKeys});this.active=0;this.keys=new Map();this.global=null;}
 enter(uid){
  const now=this.now();if(this.active>=this.inFlight)throw Error('CALL_RATE_LIMITED');
  const hash=createHash('sha256').update(uid).digest('hex');
  for(const [k,v]of this.keys)if(now-v.at>120000)this.keys.delete(k);
  if(!this.keys.has(hash)&&this.keys.size>=this.maxKeys)throw Error('CALL_RATE_LIMITED');
  const global=debit(this.global,this.perSecond*60,this.burst,now,1);
  const user=debit(this.keys.get(hash),120,20,now,1);
  this.global=global;this.keys.set(hash,user);this.active++;
  let released=false;return ()=>{if(!released){this.active--;released=true;}};
 }
}
export async function enforceCallLimits(db,uid,now=Date.now()){
 const hashed=s=>createHash('sha256').update(s).digest('hex');
 return db.runTransaction(async tx=>{
  const policy=securityPolicy((await tx.get(db.doc('photoPermitSecurityPolicy/current'))).data());
  const [user,access]=await tx.getAll(db.doc('users/'+uid),db.doc('courierAccess/'+uid));
  const u=user.data(),a=access.data();let da;
  if(u?.active===true&&['admin','editor','viewer'].includes(u.role))da=null;
  else {
   if(a?.active!==true||a.uid!==uid||typeof a.driverId!=='string'||!DA.test(a.driverId))throw new QuotaError('COURIER_DENIED');
   const driver=(await tx.get(db.doc('drivers/'+a.driverId))).data();
   if(driver?.active!==true)throw new QuotaError('DRIVER_INACTIVE');
   da=a.driverId;
  }
  const refs=[db.doc('photoPermitCallLimits/uid_'+hashed(uid)),...da?[db.doc('photoPermitCallLimits/da_'+hashed(da))]:[]];
  const old=await tx.getAll(...refs);
  const changes=old.map((s,i)=>debit(s.data(),i?policy.daPerMinute:policy.uidPerMinute,i?policy.daBurst:policy.uidBurst,now,policy.revision));
  refs.forEach((ref,i)=>tx.set(ref,changes[i]));return true;
 });
}
