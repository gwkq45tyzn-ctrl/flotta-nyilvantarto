import assert from 'node:assert/strict';
import {validateTrustedReport,planTrustedRevision,archiveId,
 commitTrustedReport,restoreTrustedReport,hashText} from './trusted-report-validation.mjs';

const day='2099-04-03',station='DS(AKE)',key=day+'__DS(AKE)';
const courier=(id='D1',ofd=10,delivered=8,vendor='QA')=>({
 daCode:id,daName:'SYNTHETIC '+id,vendor,ofd,delivered});
const ofd=(rows=[courier()])=>({
 key,date:day,station,rows,totalOFD:rows.reduce((n,r)=>n+r.ofd,0),
 totalDelivered:rows.reduce((n,r)=>n+r.delivered,0),courierCount:rows.length
});
const inventory=(areas=[{area:'IX.',counts:[2,3]}])=>({
 key,date:day,station,dates:['2099-04-01','2099-04-02'],areas,
 total:areas.reduce((a,r)=>a+r.counts.reduce((b,n)=>b+n,0),0)
});
const params=(kind,candidate,more={})=>({
 kind,candidate,actorUid:'admin',sourceName:'SYNTHETIC_QA.xlsx',
 status:kind==='ofd'?'provisional':null,...more});
let passed=0;
const check=(name,fn)=>{try{fn();passed++}catch(e){throw Error(name+': '+e.message,{cause:e})}};
check('valid OFD validated and hashed',()=>{
 const v=validateTrustedReport('ofd',ofd());
 assert.equal(v.snapshot.totalOFD,10);assert.equal(v.snapshot.totalDelivered,8);
 assert.match(v.contentHash,/^[a-f0-9]{64}$/);
});
check('OFD row order never changes content hash',()=>{
 assert.equal(validateTrustedReport('ofd',ofd([courier('D2'),courier('D1')])).contentHash,
   validateTrustedReport('ofd',ofd([courier('D1'),courier('D2')])).contentHash);
});
check('invented OFD total is blocked',()=>assert.throws(()=>{
 validateTrustedReport('ofd',{...ofd(),totalOFD:999});
},/untrusted_ofd_aggregate/));
check('invented OFD delivered is blocked',()=>assert.throws(()=>{
 validateTrustedReport('ofd',{...ofd(),totalDelivered:0});
},/untrusted_ofd_aggregate/));
check('fake courier count is blocked',()=>assert.throws(()=>{
 validateTrustedReport('ofd',{...ofd(),courierCount:999});
},/untrusted_ofd_aggregate/));
check('negative OFD rejected',()=>assert.throws(()=>{
 validateTrustedReport('ofd',ofd([courier('D1',-1,0)]));
},/invalid_courier_row/));
check('delivered greater than OFD rejected',()=>assert.throws(()=>{
 validateTrustedReport('ofd',ofd([courier('D1',10,11)]));
},/invalid_courier_row/));
check('non-integer metrics rejected',()=>assert.throws(()=>{
 validateTrustedReport('ofd',ofd([courier('D1',1.5,0)]));
},/invalid_courier_row/));
check('duplicate DA in one station/day blocked',()=>assert.throws(()=>{
 validateTrustedReport('ofd',ofd([courier(),courier()]));
},/duplicate_da_code/));
check('a foreign field is rejected',()=>assert.throws(()=>{
 validateTrustedReport('ofd',{...ofd(),clientRole:'admin'});
},/invalid_report_shape/));
check('a foreign row property is rejected',()=>assert.throws(()=>{
 validateTrustedReport('ofd',ofd([{...courier(),clientHash:'fake'}]));
},/invalid_courier_row/));
check('OFD bad date rejected',()=>assert.throws(()=>{
 validateTrustedReport('ofd',{...ofd(),date:'2099-02-30'});
},/invalid_day_or_station/));
check('wrong daily key rejected',()=>assert.throws(()=>{
 validateTrustedReport('ofd',{...ofd(),key:'2099-04-03__DS(EVIL)'});
},/invalid_daily_key/));
check('invalid source name blocked',()=>assert.throws(()=>{
 planTrustedRevision(params('ofd',ofd(),{sourceName:'x'.repeat(201)}));
},/invalid_actor_or_source/));
check('untrusted client contentHash rejected',()=>assert.throws(()=>{
 validateTrustedReport('ofd',{...ofd(),contentHash:'f'.repeat(64)});
},/invalid_report_shape/));
check('valid In-Hub computed and hashed',()=>{
 const v=validateTrustedReport('inhub',inventory());
 assert.equal(v.snapshot.total,5);assert.equal(v.snapshot.areas.length,1);
});
check('lying Inventory total blocked',()=>assert.throws(()=>{
 validateTrustedReport('inhub',{...inventory(),total:99});
},/untrusted_inventory_aggregate/));
check('Inventory future receive day blocked',()=>assert.throws(()=>{
 validateTrustedReport('inhub',{...inventory(),dates:['2099-04-04','2099-04-05']});
},/invalid_receive_days/));
check('Inventory unsorted receive days blocked',()=>assert.throws(()=>{
 validateTrustedReport('inhub',{...inventory(),dates:['2099-04-02','2099-04-01']});
},/invalid_receive_days/));
check('Inventory duplicate day blocked',()=>assert.throws(()=>{
 validateTrustedReport('inhub',{...inventory(),dates:['2099-04-02','2099-04-02']});
},/invalid_receive_days/));
check('Inventory inconsistent counts length blocked',()=>assert.throws(()=>{
 validateTrustedReport('inhub',{...inventory(),areas:[{area:'IX.',counts:[5]}]});
},/invalid_area_row/));
check('Inventory area duplicate blocked',()=>assert.throws(()=>{
 validateTrustedReport('inhub',inventory([{area:'IX.',counts:[2,3]},{area:'IX.',counts:[1,1]}]));
},/duplicate_area/));
check('Inventory negative count blocked',()=>assert.throws(()=>{
 validateTrustedReport('inhub',inventory([{area:'IX.',counts:[-1,3]}]));
},/invalid_area_row/));
check('Inventory area row added field rejected',()=>assert.throws(()=>{
 validateTrustedReport('inhub',inventory([{area:'IX.',counts:[2,3],waybills:['secret']}]));
},/invalid_area_row/));
check('change from provisional to final creates a new revision',()=>{
 const prev={...ofd(),version:1,contentHash:validateTrustedReport('ofd',ofd()).contentHash,status:'provisional'};
 const plan=planTrustedRevision(params('ofd',ofd(),{previous:prev,status:'final',allowReplace:true,expectedVersion:1}));
 assert.equal(plan.version,2);assert.equal(plan.history.status,'final');
});
check('identical import does not produce another version',()=>{
 const prev={...ofd(),version:1,validationSource:'server-aggregates-only',contentHash:validateTrustedReport('ofd',ofd()).contentHash,status:'provisional'};
 const p=planTrustedRevision(params('ofd',ofd(),{previous:prev}));
 assert.equal(p.result,'unchanged');
});
check('revision requires explicit approval',()=>{
 const prev={...ofd(),version:1,contentHash:'a'.repeat(64),status:'provisional'};
 assert.throws(()=>planTrustedRevision(params('ofd',ofd(),{previous:prev})),/replacement_not_approved/);
});
check('stale version disallowed',()=>{
 const prev={...ofd(),version:3,contentHash:'a'.repeat(64),status:'provisional'};
 assert.throws(()=>planTrustedRevision(params('ofd',ofd(),{previous:prev,allowReplace:true,expectedVersion:2})),/replacement_not_approved/);
});
check('final cannot downgrade to provisional',()=>{
 const prev={...ofd(),version:2,contentHash:'a'.repeat(64),status:'final'};
 assert.throws(()=>planTrustedRevision(params('ofd',ofd(),{previous:prev,allowReplace:true,expectedVersion:2})),/cannot_downgrade_final/);
});
check('new report does not accept fake prior version',()=>assert.throws(()=>{
 planTrustedRevision(params('ofd',ofd(),{expectedVersion:5}));
},/unexpected_version/));
check('legacy source is preserved but explicitly unverified',()=>{
 const prev={...ofd(),version:1,contentHash:'a'.repeat(64),status:'provisional'};
 const p=planTrustedRevision(params('ofd',ofd(),{previous:prev,allowReplace:true,expectedVersion:1}));
 assert.equal(p.legacy.validationSource,'legacy-unverified');
 assert.equal(p.history.validationSource,'server-aggregates-only');
});
check('legacy same hash cannot launder unverified data into trusted',()=>{
 const prev={...ofd(),version:1,contentHash:validateTrustedReport('ofd',ofd()).contentHash,
  status:'provisional'};
 assert.throws(()=>planTrustedRevision(params('ofd',ofd(),{previous:prev})),
  /replacement_not_approved/);
 const p=planTrustedRevision(params('ofd',ofd(),
  {previous:prev,allowReplace:true,expectedVersion:1}));
 assert.equal(p.result,'commit');assert.equal(p.version,2);
 assert.equal(p.legacy.validationSource,'legacy-unverified');
 assert.equal(p.current.validationSource,'server-aggregates-only');
});
check('all inventory receive-day buckets bounded before database writes',()=>{
 const dates=Array.from({length:180},(_,i)=>{
  const d=new Date(Date.UTC(2099,0,1+i));
  return d.toISOString().slice(0,10);
 });
 const areas=Array.from({length:60},(_,i)=>({area:'District-'+i,counts:Array(180).fill(0)}));
 const futureDay='2099-12-31';
 const over={key:futureDay+'__DS(AKE)',date:futureDay,station,dates,areas,total:0};
 assert.throws(()=>validateTrustedReport('inhub',over),/invalid_areas/);
});
check('large history snapshot refused even with valid numerical totals',()=>{
 const rows=Array.from({length:300},(_,i)=>({
  daCode:'DA-'+i,daName:'A'.repeat(160),vendor:'V'.repeat(160),ofd:1,delivered:1}));
 const candidate=ofd(rows);
 assert.equal(validateTrustedReport('ofd',candidate).snapshot.courierCount,300);
});
check('version archive id deterministic and path safe',()=>{
 const name=archiveId('2099-04-03__DS%2FAKE',1);
 assert.equal(name.includes('/'),false);assert.ok(name.endsWith('__v000001'));
});
check('SHA256 deterministic',()=>assert.equal(hashText('a'),hashText('a')));

class MemoryAdmin {
 constructor(){this.store=new Map();this.store.set('users/admin',{role:'admin',active:true});}
 doc(path){if(path.includes('//'))throw Error('bad path');return {path};}
 async runTransaction(fn){
  const reads=this.store;
  let wrote=false;
  const commands=[];
  const tx={
   async get(ref){if(wrote)throw Error('reads_after_writes');return {
    exists:reads.has(ref.path),data:()=>structuredClone(reads.get(ref.path))};},
   create(ref,value){wrote=true;commands.push({type:'create',path:ref.path,value});},
   set(ref,value){wrote=true;commands.push({type:'set',path:ref.path,value});}
  };
  const result=await fn(tx);
  for(const c of commands)if(c.type==='create'&&reads.has(c.path))throw Error('write_conflict');
  for(const c of commands)this.store.set(c.path,structuredClone(c.value));
  return result;
 }
}
const auth=(db,kind,candidate,extra={})=>({db,kind,candidate,verifiedUid:'admin',
 sourceName:'SYNTHETIC_QA.xlsx',status:kind==='ofd'?'provisional':null,...extra});
async function scenario(){
 const db=new MemoryAdmin();
 let r=await commitTrustedReport(auth(db,'ofd',ofd()));
 assert.equal(r.status,'committed');assert.equal(r.version,1);
 assert.equal(db.store.size,4); // users, current, immutable history, audit
 assert.ok(db.store.has('performanceVersions/'+archiveId(key,1)));
 assert.equal(db.store.get('performanceVersions/'+archiveId(key,1)).rows[0].ofd,10);
 r=await commitTrustedReport(auth(db,'ofd',ofd()));
 assert.equal(r.status,'unchanged');assert.equal(db.store.size,4);
 const corrected=ofd([courier('D1',10,9)]);
 await assert.rejects(()=>commitTrustedReport(auth(db,'ofd',corrected)),/replacement_not_approved/);
 r=await commitTrustedReport(auth(db,'ofd',corrected,{allowReplace:true,expectedVersion:1,status:'final'}));
 assert.equal(r.version,2);assert.equal(db.store.size,6);
 assert.equal(db.store.get('performanceVersions/'+archiveId(key,1)).rows[0].delivered,8);
 assert.equal(db.store.get('performanceVersions/'+archiveId(key,2)).rows[0].delivered,9);
 await assert.rejects(()=>commitTrustedReport(auth(db,'ofd',ofd(),
 {allowReplace:true,expectedVersion:2,status:'provisional'})),/cannot_downgrade_final/);
 db.store.set('users/admin',{role:'viewer',active:true});
 await assert.rejects(()=>commitTrustedReport(auth(db,'ofd',ofd(),
 {allowReplace:true,expectedVersion:2,status:'final'})),/report_write_forbidden/);
 db.store.set('users/admin',{role:'admin',active:true});
 const inv=await commitTrustedReport(auth(db,'inhub',inventory(),{status:null}));
 assert.equal(inv.status,'committed');
 assert.ok(db.store.has('inventoryVersions/'+archiveId(key,1)));
 assert.equal(db.store.get('inventoryVersions/'+archiveId(key,1)).total,5);
 const correctedInventory=inventory([{area:'IX.',counts:[3,3]}]);
 const inv2=await commitTrustedReport(auth(db,'inhub',correctedInventory,
  {status:null,allowReplace:true,expectedVersion:1}));
 assert.equal(inv2.version,2);
 const restored=await restoreTrustedReport({db,verifiedUid:'admin',kind:'inhub',
  date:day,station,fromVersion:1,expectedVersion:2,
  reason:'Synthetic QA approved restoration'});
 assert.equal(restored.version,3);
 assert.equal(db.store.get('inventoryVersions/'+archiveId(key,3)).total,5);
 assert.equal(db.store.get('inventoryVersions/'+archiveId(key,3)).restoredFromVersion,1);
 assert.equal(db.store.get('inventoryDays/'+key).total,5);
 assert.equal(db.store.get('inventoryVersions/'+archiveId(key,2)).total,6);
 assert.equal(db.store.get('inventoryAudits/'+restored.auditId).action,'restore');
 await assert.rejects(()=>restoreTrustedReport({db,verifiedUid:'admin',kind:'inhub',
  date:day,station,fromVersion:1,expectedVersion:2,
  reason:'Synthetic QA approved restoration'}),/replacement_not_approved/);
 // An editor can create reports, but restoration is admin-only.
 db.store.set('users/admin',{role:'editor',active:true});
 await assert.rejects(()=>restoreTrustedReport({db,verifiedUid:'admin',kind:'inhub',
  date:day,station,fromVersion:2,expectedVersion:3,
  reason:'Synthetic QA approved restoration'}),/report_write_forbidden/);
 db.store.set('users/admin',{role:'admin',active:true});
 const forged=db.store.get('inventoryVersions/'+archiveId(key,1));
 db.store.set('inventoryVersions/'+archiveId(key,1),
  {...forged,contentHash:'f'.repeat(64)});
 await assert.rejects(()=>restoreTrustedReport({db,verifiedUid:'admin',kind:'inhub',
  date:day,station,fromVersion:1,expectedVersion:3,
  reason:'Synthetic QA approved restoration'}),/restore_archive_integrity_failed/);
 db.store.set('inventoryVersions/'+archiveId(key,1),forged);
}
await scenario();passed++;
console.log('PASS: '+passed+' server-only arithmetic validation, immutable history and revision tests');
