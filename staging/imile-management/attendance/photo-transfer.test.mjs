import assert from 'node:assert/strict';
import {test} from 'node:test';
import {uploadImmutablePhoto,validPhotoFile,sha256} from './photo-transfer.mjs';
const jpeg=new Blob(['SYNTHETIC_BYTES'],{type:'image/jpeg'});
const missing=()=>Object.assign(Error('not found'),{code:'storage/object-not-found'});
function fixture(){const objects=new Map();let writes=0;return {objects,get writes(){return writes},
 read:async p=>{if(!objects.has(p))throw missing();return objects.get(p)},
 upload:async(p,b)=>{writes++;if(objects.has(p))throw Error('overwrite forbidden');objects.set(p,b)}};}
test('new object created exactly once',async()=>{const f=fixture();
 assert.equal(await uploadImmutablePhoto({path:'qa.jpg',blob:jpeg,...f}),'qa.jpg');assert.equal(f.writes,1);});
test('retry skips immutable existing object using actual content equality',async()=>{const f=fixture();
 await uploadImmutablePhoto({path:'qa.jpg',blob:jpeg,...f});
 await uploadImmutablePhoto({path:'qa.jpg',blob:jpeg,...f});assert.equal(f.writes,1);});
test('partial seven-photo transfer resumes without overwrites',async()=>{const f=fixture();
 for(const i of [0,1,2])await uploadImmutablePhoto({path:i+'.jpg',blob:jpeg,...f});
 for(let i=0;i<7;i++)await uploadImmutablePhoto({path:i+'.jpg',blob:jpeg,...f});
 assert.equal(f.objects.size,7);assert.equal(f.writes,7);});
test('lost upload acknowledgement recovers committed bytes',async()=>{const f=fixture();
 const upload=async(p,b)=>{await f.upload(p,b);throw Error('lost acknowledgement')};
 assert.equal(await uploadImmutablePhoto({path:'qa.jpg',blob:jpeg,read:f.read,upload}),'qa.jpg');assert.equal(f.writes,1);});
test('real upload failure remains a failure',async()=>{
 await assert.rejects(uploadImmutablePhoto({path:'qa.jpg',blob:jpeg,read:async()=>{throw missing()},
  upload:async()=>{throw Error('network broken')}}),/network broken/);});
test('changed photo never overwrites an existing object',async()=>{const f=fixture();f.objects.set('qa.jpg',new Blob(['OTHER']));
 await assert.rejects(uploadImmutablePhoto({path:'qa.jpg',blob:jpeg,...f}),/nem írható felül/);assert.equal(f.writes,0);});
test('same-size different bytes also rejected',async()=>{const f=fixture();f.objects.set('qa.jpg',new Blob(['X'.repeat(jpeg.size)]));
 await assert.rejects(uploadImmutablePhoto({path:'qa.jpg',blob:jpeg,...f}),/nem írható felül/);assert.equal(f.writes,0);});
test('permission failures never trigger blind uploads',async()=>{let writes=0;
 await assert.rejects(uploadImmutablePhoto({path:'qa.jpg',blob:jpeg,read:async()=>{throw Error('denied')},
  upload:async()=>{writes++}}),/denied/);assert.equal(writes,0);});
test('image selection accepts HEIC filename with empty camera MIME and rejects SVG/empty/oversize',()=>{
 assert.equal(validPhotoFile({size:100,name:'camera.HEIC',type:''}),true);
 for(const f of [{size:0,type:'image/jpeg'},{size:9*1024*1024,type:'image/jpeg'},
  {size:100,type:'image/svg+xml'},{size:100,type:'text/plain'}])assert.equal(validPhotoFile(f),false);
});
test('digest changes with bytes',async()=>{assert.notEqual(await sha256(jpeg),await sha256(new Blob(['OTHER'])));});
