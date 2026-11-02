import {test} from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {BUCKET,KEYS,MAX_BYTES,parseObject,pathsFor,inspectJpeg,verifyEvent,Rejected} from './verifier.mjs';
const id={uid:'synthetic_courier',sessionId:'s_'+'a'.repeat(32),stage:'in'};
const paths=pathsFor(id),event={data:{bucket:BUCKET,name:paths.front}};
const jpeg=await sharp({create:{width:32,height:24,channels:3,background:'#125684'}}).jpeg().toBuffer();
function harness(){
 let proof,invalid,commits=0,reads=0;
 const files=new Map(KEYS.map(k=>[paths[k],{bucket:BUCKET,name:paths[k],contentType:'image/jpeg',generation:'9007199254740993123',metageneration:'1',size:String(jpeg.length)}]));
 const d={objects:{metadata:async p=>files.get(p),download:async m=>{reads++;assert.equal(m.generation,'9007199254740993123');return jpeg;}},authorize:async()=>{},
  receipts:{get:async()=>proof,commit:async(_id,p)=>{commits++;proof=p;},invalidate:async(_id,why)=>{invalid=why;if(proof)proof.verified=false;}}};
 return {d,files,setProof:p=>{proof=p;},get proof(){return proof;},get invalid(){return invalid;},get commits(){return commits;},get reads(){return reads;}};
}
test('full JPEG pixel decode and hash',async()=>{const m=await inspectJpeg(jpeg);assert.equal(m.width,32);assert.match(m.sha256,/^[a-f0-9]{64}$/);});
for(const [label,bytes] of [ ['fake magic bytes',Buffer.from([255,216,255,217])],['PNG disguised as JPEG',await sharp(jpeg).png().toBuffer()],['truncated pixels',jpeg.subarray(0,jpeg.length-20)],['oversized',Buffer.alloc(MAX_BYTES+1)],['empty',Buffer.alloc(0)]])
 test(label+' rejected',async()=>assert.rejects(()=>inspectJpeg(bytes),Rejected));
for(const [label,name,bucket]of [['foreign bucket',paths.front,'evil'],['wrong UID','attendance/x/'+id.sessionId+'/in/front.jpg',BUCKET],['unknown stage',paths.front.replace('/in/','/draft/'),BUCKET],['fake session',paths.front.replace(id.sessionId,'123'),BUCKET],['unknown slot',paths.front.replace('front.jpg','other.jpg'),BUCKET],['path traversal',paths.front+'/../front.jpg',BUCKET]])
 test(label+' namespace denied',()=>assert.throws(()=>parseObject(name,bucket),Rejected));
test('seven actual pinned originals issue one existing-protocol receipt',async()=>{const h=harness();assert.equal((await verifyEvent(event,h.d)).status,'verified');assert.equal(h.commits,1);assert.equal(h.reads,7);assert.equal(h.proof.objects.cargo.generation,'9007199254740993123');});
test('incomplete upload remains pending then safely resumes',async()=>{const h=harness(),missing=h.files.get(paths.cargo);h.files.delete(paths.cargo);assert.equal((await verifyEvent(event,h.d)).status,'pending');assert.equal(h.commits,0);h.files.set(paths.cargo,missing);assert.equal((await verifyEvent(event,h.d)).status,'verified');});
test('duplicate finalize does not renew or decode already verified images',async()=>{const h=harness();await verifyEvent(event,h.d);assert.equal((await verifyEvent(event,h.d)).status,'already-verified');assert.equal(h.commits,1);assert.equal(h.reads,7);});
test('original generation replacement revokes without changing manifest',async()=>{const h=harness();await verifyEvent(event,h.d);const old=structuredClone(h.proof.objects);h.files.set(paths.front,{...h.files.get(paths.front),generation:'2'});assert.equal((await verifyEvent(event,h.d)).code,'ORIGINAL_CHANGED');assert.equal(h.invalid,'ORIGINAL_CHANGED');assert.deepEqual(h.proof.objects,old);assert.equal(h.proof.verified,false);});
test('deleted original revokes existing receipt',async()=>{const h=harness();await verifyEvent(event,h.d);h.files.delete(paths.left);assert.equal((await verifyEvent(event,h.d)).code,'OBJECT_MISSING');assert.equal(h.proof.verified,false);});
for(const [label,change]of [['MIME',{contentType:'image/png'}],['encoding',{contentEncoding:'gzip'}],['zero generation',{generation:'0'}],['unsafe size',{size:'99999999999999999999'}],['missing metageneration',{metageneration:null}]])
 test('untrusted '+label+' denied',async()=>{const h=harness();h.files.set(paths.front,{...h.files.get(paths.front),...change});assert.equal((await verifyEvent(event,h.d)).code,'INVALID_OBJECT_METADATA');assert.equal(h.commits,0);});
test('content length mismatch denied',async()=>{const h=harness();h.d.objects.download=async()=>Buffer.from('x');assert.equal((await verifyEvent(event,h.d)).code,'SIZE_MISMATCH');});
test('replacement during decode denied',async()=>{const h=harness();h.d.objects.download=async()=>{h.files.set(paths.front,{...h.files.get(paths.front),generation:'2'});return jpeg;};assert.equal((await verifyEvent(event,h.d)).code,'ORIGINAL_CHANGED');assert.equal(h.commits,0);});
test('metadata edits after proof revoke',async()=>{const h=harness();await verifyEvent(event,h.d);h.files.set(paths.front,{...h.files.get(paths.front),metageneration:'2'});assert.equal((await verifyEvent(event,h.d)).code,'ORIGINAL_CHANGED');});
test('auth/session denial cannot manufacture receipt',async()=>{const h=harness();h.d.authorize=async()=>{throw new Rejected('SESSION_OWNER');};assert.equal((await verifyEvent(event,h.d)).code,'SESSION_OWNER');assert.equal(h.reads,0);assert.equal(h.commits,0);});
test('transient Storage failure propagates for retry',async()=>{const h=harness();h.d.objects.download=async()=>{throw Error('SYNTHETIC_NETWORK');};await assert.rejects(()=>verifyEvent(event,h.d),/SYNTHETIC_NETWORK/);assert.equal(h.commits,0);});
test('transient receipt commit failure resumes using original objects',async()=>{const h=harness(),commit=h.d.receipts.commit;h.d.receipts.commit=async()=>{throw Error('SYNTHETIC_FIRESTORE');};await assert.rejects(()=>verifyEvent(event,h.d),/SYNTHETIC_FIRESTORE/);h.d.receipts.commit=commit;assert.equal((await verifyEvent(event,h.d)).status,'verified');});
