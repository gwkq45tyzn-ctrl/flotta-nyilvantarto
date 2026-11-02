import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Admission,debit,securityPolicy,SECURITY_EXAMPLE} from './call-limits.mjs';
test('configuration explicit and bounded',()=>{assert.equal(securityPolicy(SECURITY_EXAMPLE).uidBurst,10);for(const p of [null,{...SECURITY_EXAMPLE,uidBurst:0},{...SECURITY_EXAMPLE,uidBurst:'10'},{...SECURITY_EXAMPLE,extra:1}])assert.throws(()=>securityPolicy(p));});
test('token bucket debits, refills and never rewards clock reversal',()=>{
 let b=debit(null,60,2,1000,1);assert.equal(b.tokens,1);b=debit(b,60,2,1000,1);assert.throws(()=>debit(b,60,2,999,1));
 assert.equal(debit(b,60,2,2000,1).tokens,0);assert.equal(debit(b,60,2,1000,2).tokens,1);
});
test('inflight cap and idempotent release',()=>{const a=new Admission({inFlight:1});const release=a.enter('synthetic');assert.throws(()=>a.enter('second'));release();release();assert.equal(a.active,0);a.enter('second')();});
test('bounded admission keys fail closed and expire',()=>{let now=1000;const a=new Admission({now:()=>now,maxKeys:1});a.enter('first')();assert.throws(()=>a.enter('second'));now+=121000;a.enter('second')();assert.equal(a.keys.size,1);});
test('global admission bounds many different UIDs',()=>{const a=new Admission({burst:2});a.enter('first')();a.enter('second')();assert.throws(()=>a.enter('third'));});
