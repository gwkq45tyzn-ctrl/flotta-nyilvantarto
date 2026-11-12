/**
 * #210/#211 P0 durable fencing CONTRACT implemented only on demo Firestore
 * emulator. This is not a deployed trusted importer, nor production IAM.
 *
 * Explicitly stores a transactionally fenced, persisted PLAN journal only;
 * no keyed master is written, so never call the paths "imported".
 * The persistent (emulator) epoch blocks stale holders across SDK instances.
 *
 * Production requires separate legitimate service principal/IAM, real source
 * origin proof, crash recovery and verified keyed readback before final seal.
 */
import {randomUUID} from 'node:crypto';
import {doc,runTransaction} from 'firebase/firestore';
import {createLocalImporter} from '../../../tools/v1-privileged-importer-local.mjs';
import {buildPlan,sha256} from '../../../tools/v1-migration-dryrun.mjs';

const SOURCE_RESOURCE='v1MigrationSyntheticLocks/primary';
const SCOPE='SYNTHETIC_LOCAL_FIRESTORE_PERSISTENT_PLAN_ONLY';
const MAX_BATCH=48;
const denied=(reason,details=null)=>({
  ok:false,reason,details,sealed:false,authorizedForImport:false,
  productionIamVerified:false,sourceAuthorityVerified:false,
  importedKeyedDocumentsVerified:false,proofScope:SCOPE
});
const good=(extra={})=>({
  ok:true,sealed:false,authorizedForImport:false,
  productionIamVerified:false,sourceAuthorityVerified:false,
  importedKeyedDocumentsVerified:false,proofScope:SCOPE,...extra
});
const exactArray=(a,b)=>Array.isArray(a)&&Array.isArray(b)&&
  a.length===b.length&&a.every((v,i)=>v===b[i]);
const assertLocal=projectId=>{
  if(!/^demo-[a-z0-9-]+$/.test(projectId)||
     !['127.0.0.1:8787','localhost:8787'].includes(process.env.FIRESTORE_EMULATOR_HOST)||
     process.env.GOOGLE_APPLICATION_CREDENTIALS||
     process.env.FIREBASE_SERVICE_ACCOUNT)
    throw Error('TEST_ONLY_LOCAL_EMULATOR_REQUIRED');
};
export class LocalEmulatorFencing {
  #db;#ref;#pin;#revision;#token;#epoch=null;#paths=null;
  constructor({db,projectId,trustedPinnedSha,expectedRevision=1}={}){
    assertLocal(projectId);
    if(!db||typeof trustedPinnedSha!=='string'||
       !/^[0-9a-f]{64}$/.test(trustedPinnedSha)||
       !Number.isSafeInteger(expectedRevision)||expectedRevision<1)
      throw Error('MISSING_PIN_REVISION_OR_EMULATOR_DB');
    this.#db=db;
    this.#ref=doc(db,SOURCE_RESOURCE);
    this.#pin=trustedPinnedSha;
    this.#revision=expectedRevision;
    this.#token=randomUUID(); // never returned to untrusted clients
  }
  async begin(raw,backup){
    if(this.#epoch!==null)return denied('REUSED_HOLDER_DENIED');
    const pre=await createLocalImporter({
      trustedPinnedSha:this.#pin,expectedRevision:this.#revision
    }).importSource(raw,{backup});
    if(!pre.ok)return denied('PREFLIGHT_DENIED: '+pre.reason);
    let plan;
    try{plan=buildPlan(raw)}catch(e){return denied('PLAN_FAILED: '+String(e.message||e))}
    if(plan.sourceSha256!==this.#pin)return denied('SOURCE_PIN_DRIFT');
    const ids=[
      ...plan.drivers.map(d=>'drivers/'+d.id),
      ...plan.vehicles.map(v=>'vehicles/'+v.id)
    ].sort();
    if(new Set(ids).size!==ids.length)return denied('DUPLICATE_PLAN_KEY');
    const digest=sha256(ids);
    try {
      const epoch=await runTransaction(this.#db,async tx=>{
        const row=await tx.get(this.#ref);
        const current=row.exists()?row.data():null;
        if(current&&current.phase==='planning')
          throw Error('PERSISTED_LEASE_ALREADY_HELD');
        if(current&&(!Number.isSafeInteger(current.epoch)||
          current.epoch<1||current.phase!=='released'))
          throw Error('LOCK_DOCUMENT_INVALID_OR_TAMPERED');
        const next=(current?.epoch||0)+1;
        tx.set(this.#ref,{
          phase:'planning',sourceSha256:this.#pin,
          sourceRevision:this.#revision,owner:this.#token,
          epoch:next,planDigest:digest,planCount:ids.length,
          plannedIds:[],plannedDigest:sha256([]),batchCount:0,
          sealed:false,authorizedForImport:false
        });
        return next;
      },{maxAttempts:5});
      this.#epoch=epoch;this.#paths=ids;
      return good({epoch,plannedCount:0,totalPlanned:ids.length,
        proof:'PERSISTENT_EMULATOR_FENCE_ONLY'});
    }catch(e){return denied('ACQUIRE_DENIED: '+String(e.message||e))}
  }
  #assertOwn(row){
    if(!row.exists())throw Error('LOCK_CHECKPOINT_MISSING');
    const c=row.data();
    if(c.phase!=='planning'||c.owner!==this.#token||
       c.epoch!==this.#epoch||c.sourceSha256!==this.#pin||
       c.sourceRevision!==this.#revision||
       c.planDigest!==sha256(this.#paths)||
       c.planCount!==this.#paths.length||c.sealed!==false||
       c.authorizedForImport!==false||
       !Number.isSafeInteger(c.batchCount)||c.batchCount<0||
       !Array.isArray(c.plannedIds)||c.plannedDigest!==sha256(c.plannedIds)||
       !exactArray(c.plannedIds,this.#paths.slice(0,c.plannedIds.length)))
      throw Error('FENCING_TOKEN_OR_CHECKPOINT_PARITY_DENIED');
    return c;
  }
  async advance(ids){
    if(this.#epoch===null||!this.#paths)return denied('NO_OWNED_EMULATOR_LEASE');
    if(!Array.isArray(ids)||ids.length<1||ids.length>MAX_BATCH||
       ids.some(v=>typeof v!=='string')||
       new Set(ids).size!==ids.length)
      return denied('INVALID_BATCH');
    try{
      const result=await runTransaction(this.#db,async tx=>{
        const c=this.#assertOwn(await tx.get(this.#ref));
        const expected=this.#paths.slice(
          c.plannedIds.length,c.plannedIds.length+ids.length);
        if(!exactArray(ids,expected))throw Error('OUT_OF_PLAN_REPLAY_OR_ORDER');
        const next=[...c.plannedIds,...ids];
        tx.update(this.#ref,{
          plannedIds:next,plannedDigest:sha256(next),
          batchCount:c.batchCount+1
        });
        return {plannedCount:next.length,batchCount:c.batchCount+1,
          totalPlanned:this.#paths.length};
      },{maxAttempts:5});
      return good(result);
    }catch(e){return denied('ADVANCE_DENIED: '+String(e.message||e))}
  }
  async release(){
    if(this.#epoch===null)return denied('NO_OWNED_EMULATOR_LEASE');
    try{
      await runTransaction(this.#db,async tx=>{
        const c=this.#assertOwn(await tx.get(this.#ref));
        tx.update(this.#ref,{phase:'released',owner:null,
          releasedEpoch:c.epoch});
      },{maxAttempts:5});
      // This object cannot re-acquire; a new instance gets a larger epoch.
      return good({released:true,epoch:this.#epoch});
    }catch(e){return denied('RELEASE_DENIED: '+String(e.message||e))}
  }
  async seal(){return denied('SEAL_REFUSED_NO_PRODUCTION_IAM_PROOF')}
  async resume(){return denied('UNTRUSTED_DURABLE_RESUME_DENIED')}
}
export function createLocalEmulatorFencing(args){
  return new LocalEmulatorFencing(args);
}
