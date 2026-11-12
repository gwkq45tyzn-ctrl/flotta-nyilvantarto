/**
 * Local FULL RICH keyed master + immutable claim content and namespace audit.
 *
 * This checks a MATERIALIZED observation, NOT an atomic Firestore snapshot.
 * A caller-provided observation is not authoritative. Even a genuine SDK
 * collection listing can race privileged out-of-plan writes; cannot seal.
 * There is NO production signer, IAM verification or release authorization.
 */
import {sha256} from './v1-migration-dryrun.mjs';

const SCOPE='LOCAL_MATERIALIZED_INVENTORY_CONTENT_CHECK_ONLY';
const shape=o=>o!==null&&typeof o==='object'&&!Array.isArray(o)&&
  (Object.getPrototypeOf(o)===Object.prototype||Object.getPrototypeOf(o)===null);
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const result=(ok,issues=[],extra={})=>({
  ok,issues,reason:ok?'FULL_RICH_MATERIALIZED_INVENTORY_MATCH_ONLY':'INVENTORY_PARITY_DENIED',
  sealed:false,authorizedForImport:false,productionIamVerified:false,
  authenticatedSourceSignerVerified:false,authoritativeNamespaceVerified:false,
  atomicNamespaceSnapshotVerified:false,canSeal:false,proofScope:SCOPE,...extra
});
const expectedEntry=(kind,item,pin)=>{
  if(!shape(item)||typeof item.id!=='string'||!item.id||!shape(item.data)||
      !Number.isSafeInteger(item.data.sourceIndex)||item.data.sourceIndex<0||
      !Number.isSafeInteger(item.data.revision)||item.data.revision<1)
    throw Error('INVALID_RICH_KEYED_PLAN_ENTRY');
  const data=item.data;
  const id=item.id;
  const prefix=kind==='drivers'?'drivers/':'vehicles/';
  return {
    key:prefix+id,master:data,
    claim:{
      normalizedId:id,sourceIndex:data.sourceIndex,revision:data.revision,
      migrationSourceSha256:pin,masterSha256:sha256(data)
    }
  };
};
export function inventoryKeyedState(plan,observed){
  const issues=[];
  try{
    if(!shape(plan)||!Array.isArray(plan.drivers)||
      !Array.isArray(plan.vehicles)||typeof plan.sourceSha256!=='string'||
      !/^[a-f0-9]{64}$/.test(plan.sourceSha256))
      return result(false,['INVALID_CANONICAL_PLAN']);
    if(!shape(observed)||!shape(observed.masters)||!shape(observed.claims))
      return result(false,['UNTRUSTED_OR_INCOMPLETE_OBSERVATION']);
    const expected=new Map();
    for(const kind of ['drivers','vehicles']){
      for(const item of plan[kind]){
        const entry=expectedEntry(kind,item,plan.sourceSha256);
        if(expected.has(entry.key))issues.push('DUPLICATE_EXPECTED_KEY:'+entry.key);
        expected.set(entry.key,entry);
      }
    }
    const m=observed.masters,c=observed.claims;
    const keys=[...expected.keys()];
    for(const [key,entry] of expected){
      if(!own(m,key))issues.push('MISSING_MASTER:'+key);
      else{
        try{if(sha256(m[key])!==sha256(entry.master))issues.push('RICH_MASTER_MISMATCH:'+key)}
        catch{issues.push('INVALID_MASTER_CONTENT:'+key)}
      }
      if(!own(c,key))issues.push('MISSING_CLAIM:'+key);
      else{
        try{if(sha256(c[key])!==sha256(entry.claim))issues.push('CLAIM_PARITY_MISMATCH:'+key)}
        catch{issues.push('INVALID_CLAIM_CONTENT:'+key)}
      }
    }
    for(const key of Object.keys(m)){
      if(!expected.has(key))issues.push('ORPHAN_MASTER:'+key);
    }
    for(const key of Object.keys(c)){
      if(!expected.has(key))issues.push('ORPHAN_CLAIM:'+key);
    }
    return result(issues.length===0,issues,{
      expectedCount:keys.length,observedMasterCount:Object.keys(m).length,
      observedClaimCount:Object.keys(c).length,canonicalPlanDigest:sha256(keys)
    });
  }catch(e){
    return result(false,[String(e.message||e)]);
  }
}
