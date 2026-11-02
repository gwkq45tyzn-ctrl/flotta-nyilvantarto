/**
 * Offline Firebase Storage + Firestore Rules integration.
 * Synthetic courier profiles and miniature fake JPEG bytes ONLY.
 * Must never connect to staging/production and must not require live IAM.
 */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import {doc,setDoc} from 'firebase/firestore';
import {ref,uploadBytes,getMetadata,deleteObject} from 'firebase/storage';

const projectId='demo-attendance-storage';
const [firestoreRules,storageRules]=await Promise.all([
  readFile(new URL('../../../depokapacitas/firestore.rules',import.meta.url),'utf8'),
  readFile(new URL('../attendance/storage.rules',import.meta.url),'utf8')
]);
const env=await initializeTestEnvironment({
  projectId,
  firestore:{host:'127.0.0.1',port:8787,rules:firestoreRules},
  storage:{host:'127.0.0.1',port:9199,rules:storageRules}
});
const owner='courier_123',other='courier_456',inactive='courier_off',sid='s_'+'a'.repeat(32);
const file=(uid=owner,stage='in',name='front.jpg',id=sid)=>'attendance/'+uid+'/'+id+'/'+stage+'/'+name;
const fakeJpeg=new Uint8Array([255,216,255,217]);
const ctx=uid=>env.authenticatedContext(uid).storage('gs://'+projectId+'.appspot.com');
const store=(storage,path,meta={contentType:'image/jpeg'},bytes=fakeJpeg)=>uploadBytes(ref(storage,path),bytes,meta);
let successes=0;
const check=async(label,allowed,operation)=>{
  process.stdout.write('RUN '+label+'\n');
  if(allowed) await assertSucceeds(operation());
  else await assertFails(operation());
  successes++;
};
try {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async admin=>{
    const db=admin.firestore();
    await setDoc(doc(db,'courierAccess',owner),{uid:owner,driverId:'DAX001',active:true});
    await setDoc(doc(db,'courierAccess',other),{uid:other,driverId:'DAX002',active:true});
    await setDoc(doc(db,'courierAccess',inactive),{uid:inactive,driverId:'DAX003',active:false});
    await setDoc(doc(db,'users','editor'),{name:'QA editor',role:'editor',active:true});
    await setDoc(doc(db,'users','viewer'),{name:'QA viewer',role:'viewer',active:true});
  });
  const ownerStore=ctx(owner),otherStore=ctx(other),inactiveStore=ctx(inactive);
  const editorStore=ctx('editor'),viewerStore=ctx('viewer'),anonymous=env.unauthenticatedContext().storage('gs://'+projectId+'.appspot.com');
  await check('own 1st original image can be created',true,()=>store(ownerStore,file()));
  await check('own previously uploaded image is readable',true,()=>getMetadata(ref(ownerStore,file())));
  await check('other courier cannot access photo metadata',false,()=>getMetadata(ref(otherStore,file())));
  await check('anonymous cannot access photo metadata',false,()=>getMetadata(ref(anonymous,file())));
  await check('internal editor can inspect photo metadata',true,()=>getMetadata(ref(editorStore,file())));
  await check('internal viewer can inspect photo metadata',true,()=>getMetadata(ref(viewerStore,file())));
  await check('same courier cannot overwrite original photo',false,()=>store(ownerStore,file()));
  await check('same courier cannot delete original photo',false,()=>deleteObject(ref(ownerStore,file())));
  await check('other courier cannot upload under another uid',false,()=>store(otherStore,file()));
  await check('staff cannot upload photo for courier',false,()=>store(editorStore,file(owner,'out')));
  await check('inactive courier cannot create',false,()=>store(inactiveStore,file(inactive)));
  await check('unauthenticated cannot create',false,()=>store(anonymous,file('anonymous','in')));
  await check('incorrect MIME type blocked',false,()=>store(ownerStore,file(owner,'in','left.jpg'),{contentType:'text/plain'}));
  await check('missing or unsupported photo slot blocked',false,()=>store(ownerStore,file(owner,'in','roof.jpg')));
  await check('unsupported stage blocked',false,()=>store(ownerStore,file(owner,'before','left.jpg')));
  await check('invalid session id blocked',false,()=>store(ownerStore,file(owner,'in','left.jpg','invalid')));
  await check('empty image blocked',false,()=>store(ownerStore,file(owner,'in','left.jpg'),{contentType:'image/jpeg'},new Uint8Array()));
  await check('oversized image blocked',false,()=>store(ownerStore,file(owner,'in','left.jpg'),{contentType:'image/jpeg'},new Uint8Array(8*1024*1024+1)));
  await check('valid checkout image accepted',true,()=>store(ownerStore,file(owner,'out','cargo.jpg')));
  await check('storage paths outside attendance denied',false,()=>store(ownerStore,'private/tracking.jpg'));
  assert.equal(successes,20);
  console.log('PASS: '+successes+' Storage/Firestore security checks; synthetic image bytes only');
}finally{
  await env.cleanup();
}
