export function validPhotoFile(file){
 return !!file&&file.size>0&&file.size<=8*1024*1024&&
  (/^image\/(jpeg|png|webp|heic|heif)$/i.test(file.type)||
   (!file.type&&/\.(heic|heif|jpe?g|png|webp)$/i.test(file.name)));
}
export async function encodeJpeg(file){
 if(!validPhotoFile(file))throw Error('JPEG, PNG, WebP vagy HEIC fénykép szükséges, legfeljebb 8 MB.');
 let image,url;
 try{
  try{image=await createImageBitmap(file);}
  catch{
   // Native Safari image decoding is the fallback; no photo leaves the device.
   url=URL.createObjectURL(file);image=new Image();image.src=url;await image.decode();
  }
  const width=image.width||image.naturalWidth,height=image.height||image.naturalHeight;
  if(!width||!height||width*height>100000000)throw Error('A kép mérete nem feldolgozható.');
  const scale=Math.min(1,1600/Math.max(width,height));
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));
  const ctx=canvas.getContext('2d');if(!ctx)throw Error('A képfeldolgozás nem érhető el.');
  ctx.drawImage(image,0,0,canvas.width,canvas.height);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',0.8));
  if(!blob||blob.type!=='image/jpeg')throw Error('A JPEG-kép nem készíthető el.');
  return blob;
 }catch(error){
  throw Error('A fénykép nem dolgozható fel ezen a böngészőn. Készíts JPEG-képet, vagy válassz másik fotót.');
 }finally{image?.close?.();if(url)URL.revokeObjectURL(url);}
}
