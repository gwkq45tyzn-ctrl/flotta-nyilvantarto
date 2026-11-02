import {createHash} from 'node:crypto';
export const PERMIT_SOURCE='upload-quota-v1';
export const SID=/^s_[a-f0-9]{32}$/;
export const ID=/^[a-f0-9]{32}$/;
export const UID=/^[A-Za-z0-9_-]{5,128}$/;
export const DA=/^[A-Z0-9_-]{4,40}$/;
export const POLICY_EXAMPLE=Object.freeze({revision:1,enabled:false,uidDailyLimit:8,driverDailyLimit:8,permitTtlMinutes:120,resumeHours:48,maxAdminExtraPerDay:32,maxRequestAliases:32});
export class QuotaError extends Error{constructor(code){super(code);this.code=code;}}
export const deny=code=>{throw new QuotaError(code);};
export function exact(data,keys){if(!data||typeof data!=='object'||Array.isArray(data)||Object.keys(data).some(k=>!keys.includes(k))||keys.some(k=>!(k in data)))deny('INVALID_REQUEST');}
export function validatePolicy(p){
 exact(p,Object.keys(POLICY_EXAMPLE));
 for(const [k,min,max]of [['revision',1,1e9],['uidDailyLimit',1,1000],['driverDailyLimit',1,1000],['permitTtlMinutes',15,1440],['resumeHours',1,168],['maxAdminExtraPerDay',0,1000],['maxRequestAliases',1,128]])
  if(!Number.isSafeInteger(p[k])||p[k]<min||p[k]>max)deny('INVALID_POLICY');
 if(typeof p.enabled!=='boolean'||p.permitTtlMinutes>p.resumeHours*60)deny('INVALID_POLICY');
 return p;
}
export const dayKey=ms=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Budapest',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(ms));
export const hash=value=>createHash('sha256').update(value).digest('hex');
export const counterKeys=(day,uid,driverId)=>[`${day}__uid_${hash(uid)}`,`${day}__da_${driverId}`];
export function counter(d){
 if(!d)return {used:0,extra:0};
 if(!Number.isSafeInteger(d.used)||d.used<0||!Number.isSafeInteger(d.extra)||d.extra<0)deny('INVALID_COUNTER');
 return {used:d.used,extra:d.extra};
}
export function assertCapacity(u,d,p){if(u.used>=p.uidDailyLimit+u.extra||d.used>=p.driverDailyLimit+d.extra)deny('DAILY_QUOTA_EXHAUSTED');}
export const ms=t=>typeof t?.toMillis==='function'?t.toMillis():NaN;
export function validPermit(p,uid,driverId,sid,stage,now){
 return !!p&&p.source===PERMIT_SOURCE&&p.version===1&&p.status==='open'&&p.uid===uid&&p.driverId===driverId&&p.sessionId===sid&&SID.test(sid)&&
  Number.isFinite(ms(p.createdAt))&&ms(p.createdAt)<=now&&ms(stage==='in'?p.inExpiresAt:p.outExpiresAt)>now&&
  (stage!=='in'||ms(p.resumeUntil)>now&&ms(p.inExpiresAt)<=ms(p.resumeUntil));
}
