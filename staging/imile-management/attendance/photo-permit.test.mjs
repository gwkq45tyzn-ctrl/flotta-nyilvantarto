import {test} from 'node:test';
import assert from 'node:assert/strict';
import {requestPhotoPermit,clearPermitRequest} from './photo-permit.mjs';
const uid='synthetic_courier',sid='s_'+'a'.repeat(32),other='s_'+'b'.repeat(32);
const store=()=>{const m=new Map();return {getItem:k=>m.get(k),setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)};};
const result=p=>({data:{uid,sessionId:sid,source:'upload-quota-v1',stage:'in',expiresAt:Date.now()+60000,requestId:p.requestId}});
test('lost response retries with same durable request key',async()=>{const storage=store(),keys=[];clearPermitRequest(uid,storage);await assert.rejects(()=>requestPhotoPermit(async p=>{keys.push(p.requestId);throw Error('network');},{uid,stage:'in',store:storage}));await requestPhotoPermit(async p=>{keys.push(p.requestId);return result(p);},{uid,stage:'in',store:storage});assert.equal(keys[0],keys[1]);});
test('server canonical key adopted for parallel tab continuation',async()=>{const storage=store(),canonical='c'.repeat(32);await requestPhotoPermit(async p=>({data:{...result(p).data,requestId:canonical}}),{uid,stage:'in',store:storage});await requestPhotoPermit(async p=>{assert.equal(p.requestId,canonical);return result(p);},{uid,stage:'in',store:storage});});
test('checkout keeps issued session, no new request or daily quota',async()=>{await requestPhotoPermit(async p=>{assert.deepEqual(p,{action:'checkout',sessionId:sid});return {data:{...result({requestId:'c'.repeat(32)}).data,stage:'out'}};},{uid,stage:'out',sessionId:sid});});
for(const [label,change]of [['other UID',{uid:'other'}],['fabricated ID',{sessionId:'s_fake'}],['wrong source',{source:'browser'}],['wrong stage',{stage:'out'}],['missing expiry',{expiresAt:undefined}]])
 test(label+' response denied',()=>assert.rejects(()=>requestPhotoPermit(async p=>({data:{...result(p).data,...change}}),{uid,stage:'in',store:store()})));
test('checkout cannot switch session',()=>assert.rejects(()=>requestPhotoPermit(async p=>({data:{...result({requestId:'c'.repeat(32)}).data,stage:'out',sessionId:other}}),{uid,stage:'out',sessionId:sid})));
test('quota exhaustion has clear Hungarian action without auto-reallocation',async()=>{let calls=0;await assert.rejects(()=>requestPhotoPermit(async()=>{calls++;throw Error('DAILY_QUOTA_EXHAUSTED');},{uid,stage:'in',store:store()}),/napi.*keret/);assert.equal(calls,1);});
test('expired workflow requires explicit restart, never silently spends quota',async()=>{try{await requestPhotoPermit(async()=>{throw Error('PERMIT_EXPIRED_OR_FINISHED');},{uid,stage:'in',store:store()});assert.fail();}catch(e){assert.equal(e.restartAllowed,true);}});
