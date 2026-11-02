import assert from 'node:assert/strict';
import {test} from 'node:test';
import {PHOTO_KEYS} from './core.mjs';
import {photoProofMatches} from './photo-proof.mjs';
const paths=Object.fromEntries(PHOTO_KEYS.map(k=>[k,'attendance/qa_user/s_123/in/'+k+'.jpg']));
const expected={uid:'qa_user',sessionId:'s_123',stage:'in',paths};
const proof={...expected,source:'storage-verifier-v1',verified:true,verifiedAt:{toMillis:()=>Date.now()-1000}};
test('matching server proof accepted by client preflight',()=>assert.equal(photoProofMatches(proof,expected),true));
for(const [name,change] of Object.entries({missing:null,otherUser:{uid:'other'},wrongSession:{sessionId:'other'},
 wrongStage:{stage:'out'},unverified:{verified:false},wrongSource:{source:'browser'},
 noTimestamp:{verifiedAt:null},future:{verifiedAt:{toMillis:()=>Date.now()+100000}},
 missingPhoto:{paths:{front:paths.front}}}))test(name+' proof rejected',()=>
 assert.equal(photoProofMatches(change?{...proof,...change}:null,expected),false));
