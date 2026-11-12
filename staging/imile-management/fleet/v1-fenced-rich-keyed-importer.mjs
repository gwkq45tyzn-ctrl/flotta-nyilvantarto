/**
 * #213/214: ACTUAL rich keyed master + immutable claim writes, each batch
 * transactionally tied to one persisted Firestore fencing epoch.
 *
 * LOCAL FIRESTORE EMULATOR / SYNTHETIC DATA ONLY. Uses test-only privileged
 * rules-unit-testing context from its caller; not a production IAM principal,
 * Admin SDK importer, authorized source signer, cloud migration or seal.
 *
 * Release P0 stays RED for arbitrary privileged poisoned-source seeds.
 */
import {randomUUID} from 'node:crypto';
import {doc,getDoc,runTransaction} from 'firebase/firestore';
import {verifyPinnedImportSource} from '../../../tools/v1-pinned-backup-trust.mjs';
import {buildPlan,sha256} from '../../../tools/v1-migration-dryrun.mjs';

const LOCK='v1MigrationSyntheticLocks/primary';
const SCOPE='LOCAL_FIRESTORE_EMULATOR_VERIFIED_RICH_BATCH_ONLY';
const MAX_BATCH=24; // 1 lock + 2*24 master/claim READ and SET + journal
const bad=(reason,extra={})=>({
  ok:false,reason,sealed:false,authorizedForImport:false,
  realSourceSignerVerified:false,productionIamVerified:false,
  productionDeploymentVerified:false,proofScope:SCOPE,...extra
});
const ok=extra=>({
  ok:true,sealed:false,authorizedForImport:false,
  realSourceSignerVerified:false,productionIamVerified:false,
  productionDeploymentVerified:false,proofScope:SCOPE,...extra
});
const same=(a,b)=>Array.isArray(a)&&Array.isArray(b)&&
  a.length===b.length&&a.every((x,i)=>x===b[i]);
const localOnly=(db,projectId)=>{
  if(typeof projectId!=='string'||!/^demo-[a-z0-9-]+$/.test(projectId)||
    !['127.0.0.1:8787','localhost:8787'].includes(process.env.FIRESTORE_EMULATOR_HOST)||
    process.env.GOOGLE_APPLICATION_CREDENTIALS||
    process.env.FIREBASE_SERVICE_ACCOUNT||
    db?.app?.options?.projectId!==projectId)
    throw Error('LOCAL_DEMO_EMULATOR_REQUIRED');
};
const pathsFor=entry=>({
  master:(entry.kind==='drivers'?'flottaDrivers/':'flottaVehicles/')+entry.id,
  claim:(entry.kind==='drivers'?'flottaDriverClaims/':'flottaVehicleClaims/')+entry.id
});
export class LocalFencedRichKeyedImporter {
  #db;#lockRef;#pin;#revision;#owner;#epoch=null;
  #entries=null;#failed=false;#released=false;
  constructor({db,projectId,trustedPinnedSha,expectedRevision=1}={}){
    localOnly(db,projectId);
    if(typeof trustedPinnedSha!=='string'||!/^[a-f0-9]{64}$/.test(trustedPinnedSha)||
       !Number.isSafeInteger(expectedRevision)||expectedRevision<1)
      throw Error('TRUSTED_PIN_AND_REVISION_REQUIRED');
    this.#db=db;
    this.#lockRef=doc(db,LOCK);
    this.#pin=trustedPinnedSha;
    this.#revision=expectedRevision;
    this.#owner=randomUUID();
  }
  #expected(id){
    const row=this.#entries?.get(id);
    if(!row)throw Error('UNEXPECTED_KEYED_ID');
    return row;
  }
  #readLock(snapshot){
    if(!snapshot.exists())throw Error('LOCK_MISSING');
    const l=snapshot.data();
    const keys=[...this.#entries.keys()];
    if(l.phase!=='writing'||l.owner!==this.#owner||
       l.epoch!==this.#epoch||l.sourceSha256!==this.#pin||
       l.revision!==this.#revision||l.sealed!==false||
       l.authorizedForImport!==false||l.expectedCount!==keys.length||
       l.planDigest!==sha256(keys)||
       !Array.isArray(l.verifiedIds)||l.verifiedIds.length>keys.length||
       !same(l.verifiedIds,keys.slice(0,l.verifiedIds.length))||
       l.verifiedDigest!==sha256(l.verifiedIds)||
       !Number.isSafeInteger(l.batchCount)||l.batchCount<0)
      throw Error('STALE_EPOCH_OR_FORGED_JOURNAL');
    return l;
  }
  async begin(raw,backup){
    if(this.#epoch!==null||this.#released)return bad('IMPORTER_ALREADY_STARTED');
    let pre,plan;
    try{
      if(sha256(raw)!==this.#pin)return bad('RAW_SOURCE_SHA_DRIFT');
      pre=verifyPinnedImportSource({
        backup,trustedPinnedSha:this.#pin,expectedRevision:this.#revision
      });
      if(!pre.ok)return bad('PRESEAL_SOURCE_ATTESTATION_DENIED: '+pre.reason);
      plan=buildPlan(raw);
      if(plan.sourceSha256!==this.#pin)return bad('PLAN_SOURCE_SHA_DRIFT');
    }catch(e){return bad('PREFLIGHT_INVALID: '+String(e.message||e))}
    const entries=[
      ...plan.drivers.map(x=>({kind:'drivers',...x})),
      ...plan.vehicles.map(x=>({kind:'vehicles',...x}))
    ].map(e=>({
      id:e.kind+'/'+e.id,kind:e.kind,
      ...pathsFor(e),masterData:e.data,
      claimData:{
        normalizedId:e.id,sourceIndex:e.data.sourceIndex,
        revision:e.data.revision,migrationSourceSha256:this.#pin,
        masterSha256:sha256(e.data)
      }
    })).sort((a,b)=>a.id.localeCompare(b.id));
    if(new Set(entries.map(e=>e.id)).size!==entries.length)
      return bad('DUPLICATE_PLAN_ID');
    const ids=entries.map(e=>e.id);
    try{
      const result=await runTransaction(this.#db,async tx=>{
        const snap=await tx.get(this.#lockRef);
        const prev=snap.exists()?snap.data():null;
        if(prev?.phase==='writing')throw Error('ACTIVE_EPOCH_HELD');
        if(prev&&(
          prev.phase!=='released'||!Number.isSafeInteger(prev.epoch)||
          prev.epoch<1
        ))throw Error('INVALID_PREVIOUS_FENCING_STATE');
        const epoch=(prev?.epoch||0)+1;
        tx.set(this.#lockRef,{
          phase:'writing',owner:this.#owner,epoch,sourceSha256:this.#pin,
          revision:this.#revision,expectedCount:ids.length,
          planDigest:sha256(ids),verifiedIds:[],verifiedDigest:sha256([]),
          batchCount:0,sealed:false,authorizedForImport:false
        });
        return epoch;
      },{maxAttempts:5});
      this.#epoch=result;
      this.#entries=new Map(entries.map(e=>[e.id,e]));
      return ok({epoch:result,totalExpected:ids.length,verifiedKeyed:0});
    }catch(e){return bad('ACQUIRE_DENIED: '+String(e.message||e))}
  }
  async applyBatch(ids){
    if(this.#epoch===null||this.#released||!this.#entries||this.#failed)
      return bad('NO_ACTIVE_VERIFIED_IMPORTER');
    if(!Array.isArray(ids)||ids.length<1||ids.length>MAX_BATCH||
       ids.some(v=>typeof v!=='string')||new Set(ids).size!==ids.length)
      return bad('INVALID_BATCH');
    try{
      const result=await runTransaction(this.#db,async tx=>{
        const l=this.#readLock(await tx.get(this.#lockRef));
        const keys=[...this.#entries.keys()];
        const next=keys.slice(l.verifiedIds.length,l.verifiedIds.length+ids.length);
        if(!same(ids,next))throw Error('UNKNOWN_REPLAY_OR_OUT_OF_ORDER_ID');
        // All reads first; guard already-confirmed rich documents against
        // tampering and verify that new target docs are absent.
        const checkIds=[...l.verifiedIds,...next];
        const snaps=[];
        for(const id of checkIds){
          const e=this.#expected(id);
          const [master,claim]=await Promise.all([
            tx.get(doc(this.#db,e.master)),tx.get(doc(this.#db,e.claim))
          ]);
          snaps.push({id,e,master,claim,isNew:next.includes(id)});
        }
        for(const x of snaps){
          if(x.isNew){
            if(x.master.exists()||x.claim.exists())
              throw Error('UNEXPECTED_EXISTING_MASTER_OR_CLAIM');
          }else if(!x.master.exists()||!x.claim.exists()||
            sha256(x.master.data())!==sha256(x.e.masterData)||
            sha256(x.claim.data())!==sha256(x.e.claimData)){
            throw Error('PREVIOUS_VERIFIED_RICH_DOCUMENT_TAMPERED');
          }
        }
        for(const id of next){
          const e=this.#expected(id);
          tx.set(doc(this.#db,e.master),e.masterData);
          tx.set(doc(this.#db,e.claim),e.claimData);
        }
        const verified=[...l.verifiedIds,...next];
        tx.update(this.#lockRef,{
          verifiedIds:verified,verifiedDigest:sha256(verified),
          batchCount:l.batchCount+1
        });
        return {epoch:this.#epoch,verifiedCount:verified.length,
          batchCount:l.batchCount+1,totalExpected:keys.length};
      },{maxAttempts:5});
      // Independent SERVER-SDK readback, not the transient transaction input:
      // every rich nested history field and the complete claim must match.
      for(const id of ids){
        const e=this.#expected(id);
        const [m,c]=await Promise.all([
          getDoc(doc(this.#db,e.master)),getDoc(doc(this.#db,e.claim))
        ]);
        if(!m.exists()||!c.exists()||
           sha256(m.data())!==sha256(e.masterData)||
           sha256(c.data())!==sha256(e.claimData)){
          this.#failed=true;
          return bad('POST_COMMIT_FULL_RICH_READBACK_FAILED',result);
        }
      }
      return ok({...result,persistedKeyedRecordsVerified:true,
        verifiedClaimDocuments:true,sourceIntegrityRelativeToPinVerified:true});
    }catch(e){this.#failed=true;return bad('BATCH_DENIED: '+String(e.message||e))}
  }
  async rollbackBeforeSeal(){
    if(this.#epoch===null||this.#released||this.#failed||!this.#entries)
      return bad('ROLLBACK_NOT_VERIFIABLY_SAFE');
    try{
      const count=await runTransaction(this.#db,async tx=>{
        const l=this.#readLock(await tx.get(this.#lockRef));
        const all=[];
        for(const id of l.verifiedIds){
          const e=this.#expected(id);
          const [m,c]=await Promise.all([
            tx.get(doc(this.#db,e.master)),tx.get(doc(this.#db,e.claim))
          ]);
          all.push({e,m,c});
        }
        for(const {e,m,c} of all){
          if(!m.exists()||!c.exists()||
            sha256(m.data())!==sha256(e.masterData)||
            sha256(c.data())!==sha256(e.claimData))
            throw Error('ROLLBACK_DENIED_TAMPERED_RICH_RECORD');
        }
        for(const {e} of all){
          tx.delete(doc(this.#db,e.master));
          tx.delete(doc(this.#db,e.claim));
        }
        tx.update(this.#lockRef,{
          phase:'released',owner:null,verifiedIds:[],verifiedDigest:sha256([]),
          releasedEpoch:this.#epoch
        });
        return all.length;
      },{maxAttempts:5});
      this.#released=true;
      return ok({rolledBackRichMasters:count,rolledBackClaims:count,
        verifiedKeyed:0});
    }catch(e){return bad('ROLLBACK_DENIED: '+String(e.message||e))}
  }
  async seal(){return bad('SEAL_REFUSED_NO_PRODUCTION_IAM_AND_SOURCE_PROVENANCE')}
  async resume(){return bad('UNAUTHENTICATED_DURABLE_RESUME_DENIED')}
}
export function createLocalFencedRichKeyedImporter(args){
  return new LocalFencedRichKeyedImporter(args);
}
