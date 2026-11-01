// Local Firebase Firestore + Storage emulator ONLY. No customer photos.
import fs from 'node:fs/promises';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import {doc,setDoc} from 'firebase/firestore';
import {ref,uploadBytes,getMetadata,deleteObject} from 'firebase/storage';
const firestoreRules=await fs.readFile(new URL('../../../depokapacitas/firestore.rules',import.meta.url),'utf8');
const storageRules=await fs.readFile(new URL('../attendance/storage.rules',import.meta.url),'utf8');
const env=await initializeTestEnvironment({projectId:'demo-attendance-storage',firestore:{host:'127.0.0.1',port:8787,rules:firestoreRules},storage:{host:'127.0.0.1',port:9299,rules:storageRules}});
let passed=0;
const test=async(name,yes,fn)=>{console.log('RUN '+name);await(yes?assertSucceeds(fn()):assertFails(fn()));passed++;};
const uid='courier_photo_001',other='courier_photo_002',sid='s_'+'a'.repeat(32),bucket='gs://demo-attendance-storage.appspot.com';
const getStorage=(who)=>env.authenticatedContext(who).storage(bucket);
const own=getStorage(uid),otherStore=getStorage(other),staff=getStorage('editor');
const original='attendance/'+uid+'/'+sid+'/in/front.jpg';
const img=new Uint8Array([0xff,0xd8,0xff,0xd9]);
const upload=(store,path,bytes=img,contentType='image/jpeg')=>uploadBytes(ref(store,path),bytes,{contentType});
try{
 await env.clearFirestore();await env.clearStorage();
 await env.withSecurityRulesDisabled(async ctx=>{
  const d=ctx.firestore();
  for(const [user,driver] of [[uid,'DA1001'],[other,'DA1002']])await setDoc(doc(d,'courierAccess',user),{uid:user,driverId:driver,active:true});
  await setDoc(doc(d,'users','editor'),{role:'editor',active:true,name:'Synthetic'});
 });
 await test('courier original JPEG upload',true,()=>upload(own,original));
 await test('another user cannot overwrite',false,()=>upload(otherStore,original));
 await test('immutable original cannot be overwritten',false,()=>upload(own,original));
 await test('staff can read photo metadata',true,()=>getMetadata(ref(staff,original)));
 await test('other courier cannot read protected photo',false,()=>getMetadata(ref(otherStore,original)));
 await test('wrong mime type denied',false,()=>upload(own,'attendance/'+uid+'/'+sid+'/in/back.jpg',img,'image/png'));
 await test('unknown photo key denied',false,()=>upload(own,'attendance/'+uid+'/'+sid+'/in/other.jpg'));
 await test('path outside owner denied',false,()=>upload(otherStore,'attendance/'+uid+'/'+sid+'/in/left.jpg'));
 await test('oversized photo denied',false,()=>upload(own,'attendance/'+uid+'/'+sid+'/in/right.jpg',new Uint8Array(8*1024*1024+1)));
 await test('courier cannot remove photo',false,()=>deleteObject(ref(own,original)));
 console.log('PASS: '+passed+' compiled private photo Storage rules, immutable ownership');
}finally{await env.cleanup();}
