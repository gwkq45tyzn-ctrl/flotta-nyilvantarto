/**
 * Local in-process Fleet importer fencing – NOT DURABLE OR DISTRIBUTED.
 *
 * A single JS module owns the one in-process lease for the canonical
 * flottaSharedState/current resource, independent of importer instance/source
 * SHA. Concurrent attempts from any different instance in THIS process fail.
 *
 * Node workers/processes, host restarts, clouds and multiple deployments do
 * NOT share this lease. This provides no trusted external IAM, persistent
 * checkpoint, server write/readback or source signer; production seal always
 * DENIES. A production implementation requires a transactional cross-process
 * fencing token (monotonic epoch) and verified, auditable durable journal.
 */
import {createServerImporter} from './v1-server-importer-checkpoint.mjs';

const lockResource='flottaSharedState/current';
const lockScope='LOCAL_PROCESS_ONLY_NOT_DURABLE';
const leases=new Map();  // never export; no caller-controlled resource keys
const verdict=(ok,reason,extra={})=>({
  ok,reason,sealed:false,authorizedForImport:false,
  durableCheckpointVerified:false,distributedFencingVerified:false,
  persistedKeyedRecordsVerified:false,productionIamVerified:false,
  lockScope,...extra
});
const safeCopy=value=>structuredClone(value);

export class DurableCheckpointFencing {
  #importer;
  #lease=null;
  #active=null;
  #everAcquired=false;
  #beginPending=false;
  constructor(opts={}){
    this.#importer=createServerImporter(opts);
  }

  async acquire(snapshot,backup){
    if(this.#lease!==null||this.#beginPending)
      return verdict(false,'PARALLEL_IMPORT_DENIED');
    if(this.#everAcquired)
      return verdict(false,'REUSED_IMPORTER_INSTANCE_DENIED');
    if(leases.has(lockResource))
      return verdict(false,'PARALLEL_IMPORT_DENIED');

    // Register before the first await – protects a simultaneous Promise.all.
    const token=Symbol('synthetic-fleet-process-lease');
    leases.set(lockResource,token);
    this.#lease=token;
    this.#beginPending=true;
    try{
      const begin=await this.#importer.begin(snapshot,backup);
      if(!begin.ok){
        this.#freeLease();
        return verdict(false,'SOURCE_ATTESTATION_DENIED: '+String(begin.reason));
      }
      // The journal is a planned, in-memory preview. Do NOT imply data was
      // actually persisted or a real server principal acquired a lock.
      this.#active={checkpoint:safeCopy(begin.checkpoint)};
      this.#everAcquired=true;
      return verdict(true,'IN_PROCESS_PREVIEW_LEASE_ONLY',{
        checkpoint:safeCopy(begin.checkpoint)
      });
    }catch(error){
      this.#freeLease();
      return verdict(false,'PREVIEW_ERROR: '+String(error.message||error));
    }finally{
      this.#beginPending=false;
    }
  }

  #ownsLease(){
    return this.#lease!==null&&leases.get(lockResource)===this.#lease;
  }

  #freeLease(){
    if(this.#ownsLease())leases.delete(lockResource);
    this.#lease=null;
    this.#active=null;
  }

  async apply(ids){
    if(!this.#ownsLease()||!this.#active||this.#beginPending)
      return verdict(false,'NO_ACTIVE_PROCESS_LEASE');
    const result=await this.#importer.applyBatch(ids);
    // Defensive: never inadvertently promote the simulated journal into a
    // statement that any keyed documents have been written.
    return {...result,sealed:false,authorizedForImport:false,
      durableCheckpointVerified:false,distributedFencingVerified:false,
      persistedKeyedRecordsVerified:false,productionIamVerified:false,
      lockScope};
  }

  async release(){
    if(!this.#ownsLease())
      return verdict(false,'NO_OWNED_LEASE');
    this.#freeLease();
    return verdict(true,'IN_PROCESS_LEASE_RELEASED');
  }

  async seal(){
    // Never call a production or privileged seal action.
    return verdict(false,'SEAL_REFUSED_NO_PRODUCTION_IAM_PROOF');
  }

  isLocked(){return this.#ownsLease();}
  getCheckpoint(){
    return this.#ownsLease()&&this.#active
      ? safeCopy(this.#importer.getCheckpoint()) : null;
  }
}
export function createFencedImporter(opts){
  return new DurableCheckpointFencing(opts);
}
