import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assessSources,liveIndicatorPresentation} from './source-health.mjs';

const now=2_000_000;
const fresh=()=>({loaded:true,error:false,fromCache:false,pending:false,serverAt:now-1000});
const core=['demands','bookings','drivers','vehicles'];
const extra=['driverCapacities','results','attendance','sourceRows','fleetRecords','fleetAssignments','flottaSharedState','flottaMigrationApproval','flottaDrivers','flottaVehicles'];
const all=[...core,...extra];
const meta=Object.fromEntries(all.map(key=>[key,fresh()]));

assert.equal(assessSources(meta,{now,required:all}).status,'ready');
assert.equal(assessSources(meta,{now,required:all}).trusted,true);
for(const key of all){
 assert.equal(assessSources({...meta,[key]:{...meta[key],error:true}},{now,required:all}).status,'error','failed '+key);
 assert.equal(assessSources({...meta,[key]:{...meta[key],loaded:false}},{now,required:all}).status,'loading','missing '+key);
 assert.equal(assessSources({...meta,[key]:{...meta[key],fromCache:true}},{now,required:all}).status,'cached','cached '+key);
 assert.equal(assessSources({...meta,[key]:{...meta[key],pending:true}},{now,required:all}).status,'pending','pending '+key);
 assert.equal(assessSources({...meta,[key]:{...meta[key],serverAt:now-20*60000}},{now,required:all}).status,'stale','stale '+key);
 assert.equal(assessSources({...meta,[key]:{...meta[key],serverAt:now+1000}},{now,required:all}).status,'stale','future confirmation '+key);
}
assert.equal(assessSources(meta,{now,online:false,required:all}).status,'offline');
assert.equal(assessSources({}).trusted,false);
assert.equal(assessSources({...meta,flottaSharedState:{error:true,loaded:false}},{now,required:all}).trusted,false);
for(const status of ['ready','offline','error','loading','pending','cached','stale']){
 const p=liveIndicatorPresentation({status,trusted:status==='ready'});
 assert.equal(p.trusted,status==='ready',status);
 assert.match(p.text,/●/);
}
assert.match(liveIndicatorPresentation({status:'ready',trusted:true}).text,/minden ellenőrzött forrás/);
assert.doesNotMatch(liveIndicatorPresentation({status:'cached',trusted:false}).text,/minden ellenőrzött forrás/);

// A UI must derive its banner from aggregate source metadata; never just
// the last onSnapshot callback or current network state.
const app=readFileSync(new URL('./app.js',import.meta.url),'utf8');
assert.match(app,/function updateLiveIndicator\(\)/);
assert.match(app,/required:liveSources/);
assert.match(app,/const liveSources=\[\.\.\.watchedCollections,'flottaSharedState','flottaMigrationApproval','flottaDrivers','flottaVehicles'\]/);
assert.match(app,/state\.sourceMeta\.flottaSharedState=/);
assert.match(app,/onSnapshot\(collection\(db,name\),\{includeMetadataChanges:true\}/);
assert.match(app,/updateLiveIndicator\(\)/);
assert.match(app,/window\.addEventListener\(name,\(\)=>\{updateLiveIndicator\(\)/);
assert.doesNotMatch(app,/meta\.fromCache\?'● Gyorsítótárazott kapcsolat'/);
console.log('PASS: 12 source aggregate health states, including original Fleet, keyed masters and server migration approval; offline/error/cache/pending/stale fail closed');
