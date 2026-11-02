import {createHash} from 'node:crypto';
import sharp from 'sharp';

export const BUCKET='imile-management-staging.firebasestorage.app';
export const KEYS=Object.freeze(['front','left','right','back','cabinFront','cabinRear','cargo']);
export const MAX_BYTES=8*1024*1024;
const pathPattern=/^attendance\/([A-Za-z0-9_-]{5,128})\/(s_[a-f0-9]{32})\/(in|out)\/(front|left|right|back|cabinFront|cabinRear|cargo)\.jpg$/;
sharp.cache(false);sharp.concurrency(1);
export class Rejected extends Error {constructor(code){super(code);this.code=code;}}
export const reject=code=>{throw new Rejected(code);};
export function parseObject(name,bucket){
 if(bucket!==BUCKET||typeof name!=='string')reject('INVALID_NAMESPACE');
 const m=pathPattern.exec(name);if(!m)reject('INVALID_NAMESPACE');
 return {uid:m[1],sessionId:m[2],stage:m[3],slot:m[4]};
}
export const pathsFor=({uid,sessionId,stage})=>Object.fromEntries(KEYS.map(k=>[k,`attendance/${uid}/${sessionId}/${stage}/${k}.jpg`]));
export function metadataRecord(m,path){
 if(m?.bucket!==BUCKET||m.name!==path||m.contentType!=='image/jpeg'||m.contentEncoding||
  !/^[1-9][0-9]*$/.test(String(m.generation))||!/^[1-9][0-9]*$/.test(String(m.metageneration))||
  !Number.isSafeInteger(Number(m.size))||Number(m.size)<1||Number(m.size)>MAX_BYTES)reject('INVALID_OBJECT_METADATA');
 return {bucket:BUCKET,name:path,generation:String(m.generation),metageneration:String(m.metageneration),
  size:Number(m.size),contentType:'image/jpeg'};
}
export const sameObject=(a,b)=>['bucket','name','generation','metageneration','size','contentType'].every(k=>a?.[k]===b?.[k]);
export async function inspectJpeg(bytes){
 if(!Buffer.isBuffer(bytes)||bytes.length<4||bytes.length>MAX_BYTES||bytes[0]!==255||bytes[1]!==216||
  bytes.at(-2)!==255||bytes.at(-1)!==217)reject('INVALID_JPEG');
 try{
  const image=sharp(bytes,{failOn:'warning',limitInputPixels:40_000_000});
  const m=await image.metadata();
  if(m.format!=='jpeg'||!m.width||!m.height||(m.pages||1)!==1)reject('INVALID_JPEG');
  // metadata alone does NOT decode pixels. stats forces full bounded decoding.
  await image.stats();
  return {width:m.width,height:m.height,sha256:createHash('sha256').update(bytes).digest('hex')};
 }catch(e){if(e instanceof Rejected)throw e;reject('INVALID_JPEG');}
}
/** Dependencies are server adapters, never caller-supplied metadata or URLs.
 * Missing photos are normal while uploading. Infrastructure errors propagate for
 * Eventarc retries; permanent failures never produce a receipt. No public API.
 */
export async function verifyEvent(event,{objects,receipts,authorize}){
 let id;
 try{id=parseObject(event?.data?.name,event?.data?.bucket);}
 catch(e){if(e instanceof Rejected)return {status:'ignored',code:e.code};throw e;}
 const paths=pathsFor(id),old=await receipts.get(id),manifest={};
 try{
  // A proof is not an ongoing authorization grant. Once issued, storage
  // deletion/replacement MUST revoke it even if its original courier account
  // was subsequently disabled or removed. Revalidate identity/locks only when
  // issuing a NEW receipt (the commit adapter independently rechecks them).
  if(!old)await authorize(id);
  for(const key of KEYS){
   const raw=await objects.metadata(paths[key]);
   if(!raw){
    if(old) {await receipts.invalidate(id,'OBJECT_MISSING');return {status:'rejected',code:'OBJECT_MISSING'};}
    return {status:'pending'};
   }
   const m=metadataRecord(raw,paths[key]);
   if(old){
    if(old.verified!==true||old.manifestVersion!==1||!sameObject(old.objects?.[key],m)){
     await receipts.invalidate(id,'ORIGINAL_CHANGED');return {status:'rejected',code:'ORIGINAL_CHANGED'};
    }
    manifest[key]=old.objects[key];
   }else{
    // Adapter pins the exact generation and caps the streamed response.
    const bytes=await objects.download(m);
    if(bytes.length!==m.size)reject('SIZE_MISMATCH');
    manifest[key]={...m,...await inspectJpeg(bytes)};
   }
  }
  // Recheck ALL originals after decoding, including metadata edits, before commit.
  for(const key of KEYS){
   const raw=await objects.metadata(paths[key]);
   if(!raw||!sameObject(manifest[key],metadataRecord(raw,paths[key])))reject('ORIGINAL_CHANGED');
  }
  if(old)return {status:'already-verified'};
  const proof={uid:id.uid,sessionId:id.sessionId,stage:id.stage,paths,
   source:'storage-verifier-v1',verified:true,manifestVersion:1,objects:manifest};
  // Transaction repeats Firestore access/session/lock checks; create-only, with
  // a server timestamp. Concurrent finalize events cannot renew or replace proof.
  await receipts.commit(id,proof);
  return {status:'verified'};
 }catch(e){
  if(!(e instanceof Rejected))throw e;
  if(old&&['ORIGINAL_CHANGED','INVALID_OBJECT_METADATA'].includes(e.code))await receipts.invalidate(id,e.code);
  return {status:'rejected',code:e.code};
 }
}
