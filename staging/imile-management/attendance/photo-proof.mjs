import {PHOTO_KEYS} from './core.mjs';
import {sha256Blob} from './photo-upload.mjs';
export function validPhotoManifest(proof){
 return proof?.manifestVersion===1&&!!proof.objects&&Object.keys(proof.objects).length===7&&PHOTO_KEYS.every(k=>{
  const m=proof.objects[k];return m?.name===proof.paths?.[k]&&m.bucket==='imile-management-staging.firebasestorage.app'&&
   /^[1-9][0-9]*$/.test(m.generation)&&/^[1-9][0-9]*$/.test(m.metageneration)&&
   /^[a-f0-9]{64}$/.test(m.sha256)&&Number.isInteger(m.size)&&m.size>0&&m.size<=8*1024*1024&&
   m.contentType==='image/jpeg'&&Number.isInteger(m.width)&&m.width>0&&Number.isInteger(m.height)&&m.height>0;
 });
}
export function photoProofMatches(proof,{uid,sessionId,stage,paths}){
 return !!proof&&proof.uid===uid&&proof.sessionId===sessionId&&proof.stage===stage&&
  proof.source==='storage-verifier-v1'&&proof.verified===true&&
  typeof proof.verifiedAt?.toMillis==='function'&&
  Number.isFinite(proof.verifiedAt.toMillis())&&proof.verifiedAt.toMillis()<=Date.now()&&
  validPhotoManifest(proof)&&proof.paths&&Object.keys(proof.paths).length===7&&
  PHOTO_KEYS.every(k=>proof.paths[k]===paths[k]);
}
/** Never display a different live object under a previously verified filename.
 * Read metadata both sides of the download; render only the verified blob.
 */
export async function readVerifiedPhoto({proof,expected,key,metadata,download}){
 if(!photoProofMatches(proof,expected)||!PHOTO_KEYS.includes(key))throw Error('Hiányzó vagy érvénytelen szerveres fotóigazolás.');
 const original=proof.objects[key],path=expected.paths[key];
 const matches=m=>m?.bucket===original.bucket&&m.fullPath===original.name&&String(m.generation)===original.generation&&
  String(m.metageneration)===original.metageneration&&m.size===original.size&&m.contentType===original.contentType;
 if(!matches(await metadata(path)))throw Error('Az eredeti fotó tárhelyverziója megváltozott.');
 const blob=await download(path);
 if(blob.size!==original.size||blob.type!=='image/jpeg'||await sha256Blob(blob)!==original.sha256||!matches(await metadata(path)))
  throw Error('Az eredeti fotó tartalma vagy tárhelyverziója megváltozott.');
 return blob;
}
