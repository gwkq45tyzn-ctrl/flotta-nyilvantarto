/**
 * One-way, immutable Attendance photo uploads.
 *
 * Storage Rules deny overwrite. A network timeout can occur after the original
 * object was saved; re-sending would then receive permission-denied. Recover
 * ONLY when the exact original bytes are readable and match the selected
 * photo. Never silently substitute a different photo or overwrite evidence.
 */
export async function sha256Blob(blob,subtle=globalThis.crypto?.subtle){
 if(!(blob instanceof Blob)||typeof subtle?.digest!=='function')
  throw Error('A fénykép ellenőrzése nem támogatott ezen az eszközön.');
 const bytes=await blob.arrayBuffer();
 const hash=await subtle.digest('SHA-256',bytes);
 return [...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,'0')).join('');
}

/** upload(path, blob) and readOriginal(path) use authenticated Firebase Storage. */
export async function uploadOrVerifyImmutable({path,blob,upload,readOriginal}={}){
 if(typeof path!=='string'||!/^attendance\/[A-Za-z0-9_-]{5,128}\/s_[a-f0-9]{32}\/(in|out)\/(front|left|right|back|cabinFront|cabinRear|cargo)\.jpg$/.test(path))
  throw Error('Érvénytelen fotóútvonal.');
 if(!(blob instanceof Blob)||blob.type!=='image/jpeg'||blob.size<=0||blob.size>8*1024*1024)
  throw Error('Érvénytelen vagy túl nagy JPEG-fénykép.');
 if(typeof upload!=='function'||typeof readOriginal!=='function')
  throw Error('Hiányzó biztonságos tárhelyművelet.');
 try{
  await upload(path,blob);
  return Object.freeze({path,reused:false});
 }catch(originalError){
  let old;
  try{old=await readOriginal(path);}
  catch{throw originalError;}
  // Never infer successful upload merely from a URL or metadata. Compare
  // the original immutable object bytes with the image supplied for retry.
  if(!(old instanceof Blob)||old.type!=='image/jpeg'||old.size!==blob.size)
   throw Error('Már létezik egy eltérő vagy nem ellenőrizhető eredeti fotó. Kérj vezetői segítséget.');
  if(await sha256Blob(old)!==await sha256Blob(blob))
   throw Error('Az eredeti fotó eltér az új képtől; az eredeti bizonyítékot nem írhatjuk felül. Kérj vezetői segítséget.');
  return Object.freeze({path,reused:true});
 }
}
