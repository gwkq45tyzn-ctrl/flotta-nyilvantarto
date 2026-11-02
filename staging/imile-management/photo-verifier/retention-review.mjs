// DRY RUN ONLY. No SDK, network, delete, TTL or lifecycle activation.
import {PHOTO_KEYS} from '../attendance/core.mjs';
import {UID,SID} from './quota-policy.mjs';
export function photoRetentionReview({object,session,permit,lease,locks,receipt,now,days,legalHold=false,inventoryTrusted=false}={}){
 const hold=reason=>({action:'HOLD',reason,deleteAuthorized:false});
 if(inventoryTrusted!==true||session===undefined||permit===undefined||lease===undefined||receipt===undefined||!Number.isFinite(now)||!Number.isInteger(days)||days<1||days>3650||!Array.isArray(locks))return hold('INCOMPLETE_TRUSTED_INVENTORY');
 const parts=object?.name?.split('/');
 if(parts?.length!==5||parts[0]!=='attendance'||!UID.test(parts[1])||!SID.test(parts[2])||!['in','out'].includes(parts[3])||!PHOTO_KEYS.includes(parts[4].replace(/\.jpg$/,''))||!parts[4].endsWith('.jpg'))return hold('OUTSIDE_PHOTO_SCOPE');
 const [,uid,sid,stage]=parts;
 if(typeof object.generation!=='string'||!/^\d+$/.test(object.generation)||!Number.isFinite(object.createdAt)||object.createdAt>now)return hold('INVALID_ORIGINAL');
 if(legalHold||locks.length)return hold('LEGAL_HOLD_OR_LOCKED');
 if(session&&(session.uid!==uid||session.id!==sid||session.status!=='reviewed'||!Number.isFinite(session.reviewedAt)))return hold('SESSION_NOT_SAFELY_REVIEWED');
 if(!permit||permit.uid!==uid||permit.sessionId!==sid||!['inExpiresAt','outExpiresAt','resumeUntil'].every(k=>Number.isFinite(permit[k])))return hold('PERMIT_HISTORY_UNKNOWN');
 const until=Math.max(permit.inExpiresAt,permit.outExpiresAt,permit.resumeUntil);
 if(until>now||lease?.status==='open'&&(!Number.isFinite(lease.resumeUntil)||lease.resumeUntil>now))return hold('UPLOAD_OR_RESUME_WINDOW_OPEN');
 if(receipt){
  const original=receipt.objects?.[parts[4].slice(0,-4)];
  if(receipt.uid!==uid||receipt.sessionId!==sid||receipt.stage!==stage||receipt.verified!==true||original?.name!==object.name||original?.generation!==object.generation)return hold('RECEIPT_OR_GENERATION_CONFLICT');
 }else if(session)return hold('RECEIPT_HISTORY_UNKNOWN');
 const since=Math.max(object.createdAt,session?.reviewedAt||0,until);
 if(now-since<days*86400000)return hold('RETENTION_WINDOW_OPEN');
 return {action:'REVIEW_CANDIDATE_ONLY',reason:session?'REVIEWED_PHOTO':'ABANDONED_EXPIRED_UPLOAD',deleteAuthorized:false,generation:object.generation};
}
