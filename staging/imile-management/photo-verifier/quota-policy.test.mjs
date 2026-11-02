import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Timestamp} from 'firebase-admin/firestore';
import {POLICY_EXAMPLE,validatePolicy,dayKey,counterKeys,counter,assertCapacity,validPermit} from './quota-policy.mjs';
import {PhotoQuotaService} from './quota-service.mjs';
test('typed request IDs and prototype-like actions rejected before database access',async()=>{
 const svc=new PhotoQuotaService({db:null,auth:{getUser:async()=>({disabled:false})}});
 for(const data of [{action:'begin',requestId:['a'.repeat(32)]},{action:'constructor',requestId:'a'.repeat(32)},{action:['begin'],requestId:'a'.repeat(32)},{action:'checkout',sessionId:['s_'+'a'.repeat(32)]}])
  await assert.rejects(()=>svc.handle('synthetic_user',data),e=>e.code==='INVALID_REQUEST');
});
test('configuration is explicit, disabled example and configurable business limits',()=>{assert.equal(POLICY_EXAMPLE.enabled,false);assert.equal(validatePolicy({...POLICY_EXAMPLE,uidDailyLimit:100,driverDailyLimit:200}).driverDailyLimit,200);});
for(const [key,value]of [['uidDailyLimit',0],['driverDailyLimit',-1],['permitTtlMinutes',Infinity],['resumeHours','48'],['revision',1.5],['maxAdminExtraPerDay',1001],['enabled','true'],['maxRequestAliases',0]])
 test('invalid '+key+' denied',()=>assert.throws(()=>validatePolicy({...POLICY_EXAMPLE,[key]:value})));
test('unknown config and request-controlled clock fields rejected',()=>assert.throws(()=>validatePolicy({...POLICY_EXAMPLE,now:0})));
test('TTL cannot outlive resume window',()=>assert.throws(()=>validatePolicy({...POLICY_EXAMPLE,permitTtlMinutes:120,resumeHours:1})));
test('Budapest date bound is server-defined through winter/summer and DST',()=>{
 assert.equal(dayKey(Date.parse('2026-11-02T22:59:59Z')),'2026-11-02');assert.equal(dayKey(Date.parse('2026-11-02T23:00:00Z')),'2026-11-03');
 assert.equal(dayKey(Date.parse('2026-07-01T22:00:00Z')),'2026-07-02');
});
test('UID counter private hash and DA counter shared across accounts',()=>{const a=counterKeys('2026-11-02','one','SYNDA01'),b=counterKeys('2026-11-02','two','SYNDA01');assert.notEqual(a[0],b[0]);assert.equal(a[1],b[1]);assert.ok(!a[0].includes('one'));});
test('invalid persisted counter fails closed',()=>{assert.throws(()=>counter({used:-1,extra:0}));assert.throws(()=>counter({used:1,extra:'1'}));});
test('either UID or DA exhaustion stops allocation',()=>{const p={...POLICY_EXAMPLE,uidDailyLimit:2,driverDailyLimit:3};assert.throws(()=>assertCapacity({used:2,extra:0},{used:0,extra:0},p));assert.throws(()=>assertCapacity({used:0,extra:0},{used:3,extra:0},p));assertCapacity({used:2,extra:1},{used:3,extra:1},p);});
const now=Date.now(),sid='s_'+'a'.repeat(32),permit={source:'upload-quota-v1',version:1,status:'open',uid:'synthetic',driverId:'SYNDA01',sessionId:sid,createdAt:Timestamp.fromMillis(now-1000),inExpiresAt:Timestamp.fromMillis(now+10000),outExpiresAt:Timestamp.fromMillis(0),resumeUntil:Timestamp.fromMillis(now+20000)};
test('only exact UID/DA/session/stage and live expiry accepted',()=>{assert.equal(validPermit(permit,'synthetic','SYNDA01',sid,'in',now),true);assert.equal(validPermit(permit,'synthetic','SYNDA01',sid,'out',now),false);for(const p of [{...permit,uid:'other'},{...permit,driverId:'SYNDA02'},{...permit,status:'revoked'},{...permit,inExpiresAt:Timestamp.fromMillis(now)},{...permit,createdAt:Timestamp.fromMillis(now+1)}])assert.equal(validPermit(p,'synthetic','SYNDA01',sid,'in',now),false);});
