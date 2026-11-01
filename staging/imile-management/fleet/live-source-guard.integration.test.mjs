import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=name=>readFileSync(new URL(name,import.meta.url),'utf8');
const master=read('./app.mjs'),ops=read('./operations-app.mjs');
let passed=0;
const check=(name,fn)=>{try{fn();passed++}catch(e){throw Error(name+': '+e.message,{cause:e})}};
for(const [name,text] of [['master',master],['operations',ops]]){
 check(name+' authenticates role from server, not cached document',()=>{
  assert.match(text,/getDocFromServer\(doc\(db,'users',user\.uid\)\)/);
  assert.doesNotMatch(text,/getDoc\(doc\(db,'users',user\.uid\)\)/);
 });
 check(name+' subscribes to metadata-only events',()=>{
  assert.match(text,/onSnapshot\(collection\(db,name\),\{includeMetadataChanges:true\}/);
 });
 check(name+' treats cached and pending writes as not live',()=>{
  assert.match(text,/!snap(?:shot)?\.metadata\.fromCache&&!snap(?:shot)?\.metadata\.hasPendingWrites/);
 });
 check(name+' requires every source live, not just loaded',()=>{
  assert.match(text,/loaded\.size===.+&&\[\.\.\.loaded\.values\(\)\]\.every\(Boolean\)/);
 });
 check(name+' hides live content when snapshot is stale',()=>{
  assert.match(text,/\$\('(fleetContent|workspace)'\)\.hidden=true/);
 });
 check(name+' does not call Firestore write method from snapshot code',()=>{
  const section=text.slice(text.indexOf('includeMetadataChanges:true'),text.indexOf('},error=>'));
  assert.doesNotMatch(section,/\b(?:runTransaction|setDoc|updateDoc|writeBatch)\s*\(/);
 });
}
check('master blocks submits without server confirmation',()=>{
 assert.match(master,/!state\.admin\|\|!state\.uid\|\|!liveVerified/);
});
check('operations disables write actions until live verified',()=>{
 assert.match(ops,/const writable=\(\)=>liveVerified&&/);
 assert.match(ops,/control\.disabled=!writable\(\)/);
 assert.match(ops,/control\.disabled=true/);
});
check('operations inform user of cached state',()=>{
 assert.match(ops,/gyorsítótárazottak vagy függő módosítást tartalmaznak/);
});
check('master inform user of cached state',()=>{
 assert.match(master,/Csak gyorsítótárazott vagy függő adat érhető el/);
});
console.log('PASS: '+passed+' server-authoritative Fleet cache and role safety contract checks');
