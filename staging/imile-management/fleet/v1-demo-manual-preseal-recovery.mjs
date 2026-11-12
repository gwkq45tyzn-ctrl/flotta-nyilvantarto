/**
 * Explicit manual pre-seal rollback of an abandoned DEMO EMULATOR import.
 *
 * Recovery is NEVER automatic. The caller's manualApproval here is a
 * synthetic local test switch, not proof of an authorized human/operator.
 * No cloud IAM, authenticated owner signoff, production deployment, source
 * signer, or production crash-recovery safety can be inferred.
 *
 * Recovery changes the persisted fencing epoch BEFORE touching any keyed
 * master/claim. The stale writer then fails because its old owner/epoch is
 * invalid. Keyed pairs are deleted only after complete original rich-data
 * and immutable claim SHA readback. All journal progress is atomic with
 * each bounded deletion batch. The real P0 hostile booking gate stays RED.
 */
import {randomUUID} from 'node:crypto';
import {doc,runTransaction} from 'firebase/firestore';
import {verifyPinnedImportSource} from '../../../tools/v1-pinned-backup-trust.mjs';
import {sha256,buildPlan} from '../../../tools/v1-migration-dryrun.mjs';

const LOCK='v1MigrationSyntheticLocks/primary';
const MAX_RECOVERY=24;
const SCOPE='DEMO_EMULATOR_MANUAL_PRESEAL_RECOVERY_ONLY';
const deny=reason=>({ok:false,reason,sealed:false,authorizedForImport:false,
  productionIamVerified:false,ownerApprovalAuthenticated:false,
  provenanceSignerVerified:false,proofScope:SCOPE});
const allow=extra=>({ok:true,sealed:false,authorizedForImport:false,
  productionIamVerified:false,ownerApprovalAuthenticated:false,
  provenanceSignerVerified:false,proofScope:SCOPE,...extra});
const same=(a,b)=>Array.isArray(a)&&Array.isArray(b)&&
  a.length===b.length&&a.every((v,i)=>v===b[i]);
export class DemoManualPresealRecovery {
  #db;#ref;#pin;#revision;#token;#epoch=null;#entries=null;
  constructor({db,projectId,trustedPinnedSha,expectedRevision=1}={}){
    if(!/^demo-[a-z0-9-]+$/.test(projectId||'')||
       !['127.0.0.1:8787','localhost:8787'].includes(process.env.FIRESTORE_EMULATOR_HOST)||
       process.env.GOOGLE_APPLICATION_CREDENTIALS||
       process.env.FIREBASE_SERVICE_ACCOUNT||
       db?.app?.options?.projectId!==projectId||
       !/^[a-f0-9]{64}$/.test(trustedPinnedSha||'')||
       !Number.isSafeInteger(expectedRevision)||expectedRevision<1)
      throw Error('SYNTHETIC_FIRESTORE_EMULATOR_ONLY_AND_INDEPENDENT_PIN_REQUIRED');
    this.#db=db;this.#ref=doc(db,LOCK);this.#pin=trustedPinnedSha;
    this.#revision=expectedRevision;this.#token=randomUUID();
  }
  #expectedPlan(raw){
    const p=buildPlan(raw);
    if(p.sourceSha256!==this.#pin)throw Error('SOURCE_DRIFT');
    const e=[
      ...p.drivers.map(x=>({kind:'drivers',id:x.id,data:x.data})),
      ...p.vehicles.map(x=>({kind:'vehicles',id:x.id,data:x.data}))
    ].map(x=>{
      const namespace=x.kind==='drivers'?'flottaDrivers':'flottaVehicles';
      const claimNS=x.kind==='drivers'?'flottaDriverClaims':'flottaVehicleClaims';
      return {
        key:x.kind+'/'+x.id,master:namespace+'/'+x.id,
        claim:claimNS+'/'+x.id,data:x.data,
        claimData:{
          normalizedId:x.id,sourceIndex:x.data.sourceIndex,
          revision:x.data.revision,migrationSourceSha256:this.#pin,
          masterSha256:sha256(x.data)
        }
      };
    }).sort((a,b)=>a.key.localeCompare(b.key));
    return new Map(e.map(x=>[x.key,x]));
  }
  #validLock(c,phase){
    const keys=[...this.#entries.keys()];
    return c&&c.phase===phase&&c.owner===this.#token&&
      c.epoch===this.#epoch&&c.sourceSha256===this.#pin&&
      c.revision===this.#revision&&c.expectedCount===keys.length&&
      c.planDigest===sha256(keys)&&c.sealed===false&&
      c.authorizedForImport===false&&
      Array.isArray(c.verifiedIds)&&c.verifiedIds.length<=keys.length&&
      same(c.verifiedIds,keys.slice(0,c.verifiedIds.length))&&
      c.verifiedDigest===sha256(c.verifiedIds)&&
      Number.isSafeInteger(c.batchCount)&&c.batchCount>=0;
  }
  async claimAbandoned(raw,backup,{manualApproval,expectedAbandonedEpoch}={}){
    if(this.#epoch!==null)return deny('RECOVERY_ALREADY_STARTED');
    if(manualApproval!==true||!Number.isSafeInteger(expectedAbandonedEpoch)||
       expectedAbandonedEpoch<1)
      return deny('EXPLICIT_LOCAL_MANUAL_APPROVAL_AND_EXPECTED_EPOCH_REQUIRED');
    try{
      if(sha256(raw)!==this.#pin)return deny('SOURCE_SHA_DRIFT');
      const proof=verifyPinnedImportSource({
        backup,trustedPinnedSha:this.#pin,expectedRevision:this.#revision
      });
      if(!proof.ok)return deny('PINNED_SOURCE_REFUSED: '+proof.reason);
      const entries=this.#expectedPlan(raw);
      const keys=[...entries.keys()];
      if(new Set(keys).size!==keys.length)return deny('DUPLICATE_RICH_SOURCE_KEY');
      const result=await runTransaction(this.#db,async tx=>{
        const snap=await tx.get(this.#ref);
        if(!snap.exists())throw Error('ABANDONED_LOCK_ABSENT');
        const c=snap.data();
        if(c.phase!=='writing'||c.epoch!==expectedAbandonedEpoch||
           !Number.isSafeInteger(c.epoch)||c.epoch<1||
           typeof c.owner!=='string'||!c.owner||
           c.sourceSha256!==this.#pin||c.revision!==this.#revision||
           c.expectedCount!==keys.length||c.planDigest!==sha256(keys)||
           c.sealed!==false||c.authorizedForImport!==false||
           !Array.isArray(c.verifiedIds)||c.verifiedIds.length>keys.length||
           !same(c.verifiedIds,keys.slice(0,c.verifiedIds.length))||
           c.verifiedDigest!==sha256(c.verifiedIds)||
           !Number.isSafeInteger(c.batchCount)||c.batchCount<0)
          throw Error('ABANDONED_LOCK_UNVERIFIED_OR_STALE');
        // REVOKE the old writer atomically: it cannot pass the epoch + owner
        // predicate of its next write transaction after this transition.
        const next=c.epoch+1;
        tx.update(this.#ref,{
          phase:'recovering',owner:this.#token,epoch:next,
          recoveryFromEpoch:c.epoch,manualRecoverySynthetic:true
        });
        return {epoch:next,remaining:c.verifiedIds.length};
      },{maxAttempts:5});
      this.#epoch=result.epoch;this.#entries=entries;
      return allow(result);
    }catch(error){return deny('RECOVERY_CLAIM_DENIED: '+String(error.message||error))}
  }
  async rollbackBatch(limit=MAX_RECOVERY){
    if(this.#epoch===null||!this.#entries)return deny('NO_RECOVERY_EPOCH');
    if(!Number.isSafeInteger(limit)||limit<1||limit>MAX_RECOVERY)
      return deny('RECOVERY_BATCH_LIMIT_INVALID');
    try{
      const result=await runTransaction(this.#db,async tx=>{
        const snap=await tx.get(this.#ref);
        const c=snap.exists()?snap.data():null;
        if(!this.#validLock(c,'recovering'))
          throw Error('RECOVERY_EPOCH_OR_JOURNAL_TAMPERED');
        const n=Math.min(limit,c.verifiedIds.length);
        const remove=c.verifiedIds.slice(c.verifiedIds.length-n);
        const rows=[];
        for(const id of remove){
          const expected=this.#entries.get(id);
          if(!expected)throw Error('UNEXPECTED_JOURNAL_ID');
          const [master,claim]=await Promise.all([
            tx.get(doc(this.#db,expected.master)),
            tx.get(doc(this.#db,expected.claim))
          ]);
          if(!master.exists()||!claim.exists()||
            sha256(master.data())!==sha256(expected.data)||
            sha256(claim.data())!==sha256(expected.claimData))
            throw Error('RICH_MASTER_OR_IMMUTABLE_CLAIM_DRIFT');
          rows.push(expected);
        }
        const left=c.verifiedIds.slice(0,c.verifiedIds.length-n);
        for(const r of rows){
          tx.delete(doc(this.#db,r.master));
          tx.delete(doc(this.#db,r.claim));
        }
        tx.update(this.#ref,{
          verifiedIds:left,verifiedDigest:sha256(left),
          phase:left.length===0?'released':'recovering',
          ...(left.length===0?{owner:null,releasedEpoch:this.#epoch}: {})
        });
        return {removed:n,remaining:left.length,epoch:this.#epoch,
          complete:left.length===0};
      },{maxAttempts:5});
      return allow(result);
    }catch(error){return deny('RECOVERY_BATCH_DENIED: '+String(error.message||error))}
  }
  async seal(){return deny('PRODUCTION_SEAL_NEVER_SUPPORTED')}
  async resumeUnverified(){return deny('UNVERIFIED_RESUME_NEVER_SUPPORTED')}
}
export function createDemoManualPresealRecovery(opts){
  return new DemoManualPresealRecovery(opts);
}
