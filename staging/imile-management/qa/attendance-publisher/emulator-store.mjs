/** Explicit loopback REST only. No ADC, Firebase credential, cloud URL or env fallback.
 * The only accepted project/database/collections are dedicated synthetic QA ones.
 */
import {prepareSyntheticTransaction,assertSnapshot,SOURCE_PATH,fail} from './synthetic-transaction.mjs';
const project='demo-imile-attendance-atomic';
const allowed=/^(qaAtomicSources\/SYNTHETIC_TEST|qaAtomicEvents\/QA_[A-Z0-9_]{1,100}|qaAtomicAudit\/QA_MUT_[A-Z0-9_]{1,80}|qaAtomicProjections\/\d{4}-\d{2}-\d{2}__QA\d{4})$/;
const encode=v=>v===null?{nullValue:null}:Array.isArray(v)?{arrayValue:{values:v.map(encode)}}:
 typeof v==='object'?{mapValue:{fields:Object.fromEntries(Object.entries(v).map(([k,x])=>[k,encode(x)]))}}:
 typeof v==='boolean'?{booleanValue:v}:typeof v==='number'?{integerValue:String(v)}:{stringValue:v};
const decode=v=>'nullValue'in v?null:'arrayValue'in v?(v.arrayValue.values||[]).map(decode):
 'mapValue'in v?Object.fromEntries(Object.entries(v.mapValue.fields||{}).map(([k,x])=>[k,decode(x)])):
 'integerValue'in v?Number(v.integerValue):'booleanValue'in v?v.booleanValue:v.stringValue;
export function createEmulatorStore({host,projectId}={}){
 if(projectId!==project||typeof host!=='string'||!/^127\.0\.0\.1:[1-9]\d{3,4}$/.test(host)||
  Number(host.split(':')[1])>65535)fail('explicit_loopback_demo_target_required');
 const base='http://'+host+'/v1/projects/'+project+'/databases/(default)/documents';
 const name=p=>{if(!allowed.test(p))fail('qa_path_required');return base.slice(base.indexOf('/projects/')+1)+'/'+p;};
 const rpc=async(suffix,body)=>{
  const r=await fetch(base+suffix,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json',
   Authorization:'Bearer owner'},body:JSON.stringify(body)});
  const json=await r.json();if(!r.ok){const e=new Error('emulator_rpc_'+r.status);
   e.retryable=[409,503].includes(r.status);throw e;}return json;};
 const read=async(path,transaction)=>{
  const result=await rpc(':batchGet',{documents:[name(path)],...(transaction?{transaction}:{})});
  const doc=result.find(x=>x.found)?.found;
  return doc?decode({mapValue:{fields:doc.fields}}):null;
 };
 const write=w=>w.delete?{delete:name(w.delete)}:
  {update:{name:name(w.path),fields:encode(w.data).mapValue.fields}};
 return Object.freeze({
  read,
  async seed(snapshot){assertSnapshot(snapshot,snapshot?.observedAt);
   await rpc(':commit',{writes:[write({path:SOURCE_PATH,data:snapshot})]});},
  async transact(request,{now=Date.now(),beforeCommit}={}){
   request=structuredClone(request);
   for(let attempt=0;attempt<5;attempt++){
    const {transaction}=await rpc(':beginTransaction',{options:{readWrite:{}}});
    try{
     const snapshot=await read(SOURCE_PATH,transaction);
     const audit=await read('qaAtomicAudit/'+request.id,transaction);
     const prepared=prepareSyntheticTransaction({snapshot,request,priorAudit:audit,now});
     if(beforeCommit)await beforeCommit({attempt});
     if(prepared.duplicate)await rpc(':rollback',{transaction});
     else await rpc(':commit',{transaction,writes:prepared.writes.map(write)});
     return {...prepared.result,duplicate:prepared.duplicate};
    }catch(e){await rpc(':rollback',{transaction}).catch(()=>{});
     if(!e.retryable||attempt===4)throw e;}
   }
  }
 });
}
