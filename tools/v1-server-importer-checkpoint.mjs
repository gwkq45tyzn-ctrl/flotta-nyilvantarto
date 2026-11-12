/**
 * P0 local DRY-RUN journal only. No SDK, server authority, external secrets,
 * Firestore writes, seal, claim seed, restore or durable resume capability.
 *
 * The journal describes PLANNED records, NOT completed imported writes.
 * A production importer must verify every batch's actual persisted contents
 * under a separately authorized IAM principal before checkpoint advancement.
 */
import {createLocalImporter} from './v1-privileged-importer-local.mjs';
import {buildPlan,sha256} from './v1-migration-dryrun.mjs';

const scope='LOCAL_PLANNED_JOURNAL_ONLY';
const deny=reason=>({
  ok:false,reason,sealed:false,authorizedForImport:false,
  productionIamVerified:false,durableCheckpointVerified:false,
  persistedKeyedRecordsVerified:false,proofScope:scope
});
const copy=o=>structuredClone(o);
const maxBatchSize=48;
export class ServerImporterCheckpoint {
  #importer;
  #state=null;
  #planned=[];
  #beginPending=false;

  constructor(opts={}){
    // Strictly a no-write adapter. Non-dry-run is denied by the importer.
    this.#importer=createLocalImporter(opts);
  }

  async begin(snapshot,backup){
    if(this.#beginPending||this.#state!==null)
      return deny('CHECKPOINT_ALREADY_ACTIVE_OR_BEGIN_PENDING');
    this.#beginPending=true;
    try{
      const pre=await this.#importer.importSource(snapshot,{backup});
      if(!pre.ok)return deny('PREFLIGHT_DENIED: '+pre.reason);
      // Exact normalized keyed IDs and sourceIndex are derived from the
      // same full-rich source. Never accept claimed IDs from the caller.
      const plan=buildPlan(snapshot);
      if(plan.sourceSha256!==pre.sourceSha256)
        return deny('SOURCE_DRIFT_DURING_BEGIN');
      const planned=[
        ...plan.drivers.map(x=>'drivers/'+x.id),
        ...plan.vehicles.map(x=>'vehicles/'+x.id)
      ].sort();
      if(planned.length!==pre.projectedDocumentCount)
        return deny('PLAN_COUNT_MISMATCH');
      this.#planned=planned;
      this.#state={
        phase:'planning',sourceSha256:pre.sourceSha256,
        expectedRevision:pre.expectedRevision,
        totalPlanned:planned.length,plannedDigest:sha256(planned),
        plannedIds:[],batchCount:0,sealed:false
      };
      return {
        ok:true,checkpoint:this.getCheckpoint(),sealed:false,
        authorizedForImport:false,persistedKeyedRecordsVerified:false,
        proofScope:scope
      };
    }catch(error){
      return deny('PREVIEW_EXCEPTION: '+String(error.message||error));
    }finally{
      this.#beginPending=false;
    }
  }

  async applyBatch(ids){
    // No I/O or await between validation and commit to the LOCAL journal.
    if(this.#beginPending||!this.#state||this.#state.phase!=='planning')
      return deny('NO_OPEN_PLANNING_CHECKPOINT');
    if(!Array.isArray(ids)||ids.length<1||ids.length>maxBatchSize)
      return deny('INVALID_BATCH_SIZE_OR_SHAPE');
    if(ids.some(v=>typeof v!=='string'||v.length<1)||
       new Set(ids).size!==ids.length)
      return deny('DUPLICATE_OR_INVALID_BATCH_ID');
    const start=this.#state.plannedIds.length;
    const expected=this.#planned.slice(start,start+ids.length);
    if(expected.length!==ids.length||ids.some((id,i)=>id!==expected[i]))
      return deny('UNKNOWN_REPLAYED_OR_OUT_OF_ORDER_BATCH_ID');
    // Only a preview; NEVER report these IDs as imported/persisted.
    this.#state.plannedIds.push(...ids);
    this.#state.batchCount++;
    return {
      ok:true,plannedCount:this.#state.plannedIds.length,
      totalPlanned:this.#planned.length,batchCount:this.#state.batchCount,
      isPlanComplete:this.#state.plannedIds.length===this.#planned.length,
      sealed:false,authorizedForImport:false,
      persistedKeyedRecordsVerified:false,proofScope:scope
    };
  }

  async seal(){
    // No seal method/flag can be unlocked by passing an IAM-like option.
    return deny('SEAL_REFUSED_NO_PRODUCTION_IAM_PROOF');
  }

  getCheckpoint(){
    return this.#state===null?null:{
      ...copy(this.#state),
      integrityHash:sha256(this.#state),
      // An unkeyed content hash is only for diagnostics. A malicious
      // checkpoint could recompute it; this is NOT durable resume proof.
      integrityHashAuthenticated:false,
      authorizedForImport:false,
      persistedKeyedRecordsVerified:false,
      durableCheckpointVerified:false
    };
  }

  getNextBatch(limit=maxBatchSize){
    if(this.#beginPending||!this.#state||!Number.isSafeInteger(limit)||
       limit<1||limit>maxBatchSize)return null;
    return copy(this.#planned.slice(
      this.#state.plannedIds.length,this.#state.plannedIds.length+limit
    ));
  }

  resume(){
    // Loading an arbitrary external checkpoint would trust unverified
    // self-consistent forged progress; never pretend to support it.
    return deny('DURABLE_RESUME_NOT_IMPLEMENTED');
  }
}
export function createServerImporter(opts){return new ServerImporterCheckpoint(opts);}
