import assert from 'node:assert/strict';
import {assessSources} from './source-health.mjs';
const now=2000000,meta=Object.fromEntries(['demands','bookings','drivers','vehicles'].map(x=>[x,{loaded:true,error:false,fromCache:false,pending:false,serverAt:now-1000}]));
assert.equal(assessSources(meta,{now}).trusted,true);
assert.equal(assessSources(meta,{now,online:false}).status,'offline');
assert.equal(assessSources({...meta,demands:{...meta.demands,error:true}},{now}).status,'error');
assert.equal(assessSources({...meta,demands:{loaded:false}},{now}).status,'loading');
assert.equal(assessSources({...meta,demands:{...meta.demands,fromCache:true}},{now}).status,'cached');
assert.equal(assessSources({...meta,demands:{...meta.demands,pending:true}},{now}).status,'pending');
assert.equal(assessSources(meta,{now:now+20*60000}).status,'stale');
assert.equal(assessSources({}).trusted,false);
assert.equal(assessSources({...meta,demands:{...meta.demands,serverAt:undefined}},{now}).trusted,false);
const fleetKeys=['vehicles','drivers','bookings','fleetRecords','fleetAssignments','attendance'];
const fleet=Object.fromEntries(fleetKeys.map(k=>[k,{
 loaded:true,error:false,fromCache:false,pending:false,serverAt:now-1000
}]));
assert.equal(assessSources(fleet,{now,required:fleetKeys}).trusted,true);
for(const key of fleetKeys){
 assert.equal(assessSources({...fleet,[key]:{...fleet[key],fromCache:true}},
  {now,required:fleetKeys}).trusted,false,'cached '+key);
 assert.equal(assessSources({...fleet,[key]:{...fleet[key],pending:true}},
  {now,required:fleetKeys}).status,'pending','pending '+key);
 assert.equal(assessSources({...fleet,[key]:{...fleet[key],serverAt:now-20*60000}},
  {now,required:fleetKeys}).status,'stale','stale '+key);
 const removed={...fleet};delete removed[key];
 assert.equal(assessSources(removed,{now,required:fleetKeys}).status,'loading','missing '+key);
}
assert.equal(assessSources(fleet,{now,online:false,required:fleetKeys}).trusted,false);
assert.equal(assessSources({...fleet,attendance:{...fleet.attendance,serverAt:now+1000}},
 {now,required:fleetKeys}).status,'stale');
console.log('PASS: Fleet alerts require all six fresh server-confirmed collections');
console.log('PASS: 9 source-health states; missing/offline/cache/error never trusted');
