import assert from 'node:assert/strict';
import {sha256Blob,uploadOrVerifyImmutable} from './photo-upload.mjs';

const path='attendance/courier_123/s_'+'a'.repeat(32)+'/out/front.jpg';
const photo=new Blob([new Uint8Array([0xff,0xd8,0xff,0xd9])],{type:'image/jpeg'});
const different=new Blob([new Uint8Array([0xff,0xd8,0x03,0xd9])],{type:'image/jpeg'});
assert.notEqual(await sha256Blob(photo),await sha256Blob(different));
let saved=null,uploadCalls=0;
const upload=async(_path,blob)=>{uploadCalls++;if(saved)throw Error('storage/unauthorized');saved=blob;};
const readOriginal=async()=>saved;
const first=await uploadOrVerifyImmutable({path,blob:photo,upload,readOriginal});
assert.deepEqual(first,{path,reused:false});
const second=await uploadOrVerifyImmutable({path,blob:photo,upload,readOriginal});
assert.deepEqual(second,{path,reused:true});
assert.equal(uploadCalls,2);
assert.equal(saved,photo,'Existing evidence must stay unchanged');
await assert.rejects(()=>uploadOrVerifyImmutable({path,blob:different,upload,readOriginal}),/eredeti fotó eltér/);
assert.equal(saved,photo,'Different replacement must not alter original');
await assert.rejects(()=>uploadOrVerifyImmutable({
 path:path.replace('/front.jpg','/left.jpg'),blob:photo,
 upload:async()=>{throw Error('permission-denied');},
 readOriginal:async()=>{throw Error('storage/object-not-found');}
}),/permission-denied/);
for(const invalidPath of ['/another.jpg',path.replace('/out/','/unsafe/'),path.replace('courier_123','x')]){
 await assert.rejects(()=>uploadOrVerifyImmutable({path:invalidPath,blob:photo,upload,readOriginal}),/útvonal/);
}
await assert.rejects(()=>uploadOrVerifyImmutable({path,blob:new Blob(['wrong'],{type:'text/plain'}),upload,readOriginal}),/JPEG/);
await assert.rejects(()=>uploadOrVerifyImmutable({path,blob:new Blob([],{type:'image/jpeg'}),upload,readOriginal}),/JPEG/);
await assert.rejects(()=>uploadOrVerifyImmutable({
 path,blob:photo,upload:async()=>{throw Error('network');},
 readOriginal:async()=>new Blob(['different'],{type:'text/plain'})
}),/eltérő vagy nem ellenőrizhető/);
console.log('PASS: immutable photo upload recovery, no silently replaced photos, corrupt uploads denied');
