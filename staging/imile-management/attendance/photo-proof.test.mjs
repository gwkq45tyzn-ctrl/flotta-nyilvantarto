import assert from 'node:assert/strict';
import {test} from 'node:test';
import {PHOTO_KEYS} from './core.mjs';
import {photoProofMatches} from './photo-proof.mjs';
const paths=Object.fromEntries(PHOTO_KEYS.map(k=>[k,'attendance/qa_user/s_123/in/'+k+'.jpg']));
const expected={uid:'qa_user',sessionId:'s_123',stage:'in',paths};
const objects=Object.fromEntries(PHOTO_KEYS.map(k=>[k,{bucket:'imile-management-staging.firebasestorage.app',name:paths[k],generation:'1',metageneration:'1',size:100,contentType:'image/jpeg',width:20,height:20,sha256:'a'.repeat(64)}]));
const proof={...expected,source:'storage-verifier-v1',verified:true,verifiedAt:{toMillis:()=>Date.now()-1000},manifestVersion:1,objects};
test('matching server proof accepted by client preflight',()=>assert.equal(photoProofMatches(proof,expected),true));
for(const [name,change] of Object.entries({missing:null,otherUser:{uid:'other'},wrongSession:{sessionId:'other'},
 wrongStage:{stage:'out'},unverified:{verified:false},wrongSource:{source:'browser'},
 noTimestamp:{verifiedAt:null},future:{verifiedAt:{toMillis:()=>Date.now()+100000}},
 missingPhoto:{paths:{front:paths.front}},noManifest:{objects:null},wrongManifestVersion:{manifestVersion:0},wrongObject:{objects:{...objects,front:{...objects.front,name:'fake'}}}}))test(name+' proof rejected',()=>
 assert.equal(photoProofMatches(change?{...proof,...change}:null,expected),false));
