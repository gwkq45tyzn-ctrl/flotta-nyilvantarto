/**
 * STRICT V1 SERVER-SEAL BOUNDARY — PREVIEW ONLY, NO SEAL CAPABILITY.
 *
 * No arbitrary caller-supplied boolean, count, SDK query result, public
 * key, "IAM verified" assertion or matching digest can authorize import or
 * seal. A privileged external writer can mutate keyed/claim collections
 * outside Firestore Rules. Four ordinary collection reads, even with lock
 * reads in transactions before/after, never comprise an atomic namespace
 * snapshot and cannot exclude TOCTOU inserts after the preview.
 *
 * inspectLocalEmulator() is only a real, read-only diagnostic (on a DEMO
 * Firestore emulator, under original Rules in its executable tests).
 * It deliberately returns a success for DATA PARITY ONLY. All fields
 * signaling actual server release authority remain FALSE.
 *
 * Production would need an independently registered owner trust root,
 * authenticated service principal and full writer/cutover isolation,
 * closed-world namespace verification and irrevocable fenced seal.
 * None are implemented here. Original P0 remains a blocking RED.
 */
import {createAtomicPresealInventory} from './v1-atomic-preseal-inventory.mjs';

const SCOPE='LOCAL_DEMO_READ_ONLY_SEAL_BOUNDARY_NO_PRODUCTION_AUTHORITY';
const review=(ok,reason,other={})=>({
  ok,reason,canSeal:false,sealed:false,authorizedForImport:false,
  productionIamVerified:false,externalTrustRootAuthenticityVerified:false,
  privilegedImporterVerified:false,atomicNamespaceSnapshotVerified:false,
  closedWriterSetVerified:false,ownerApprovalAuthenticated:false,
  proofScope:SCOPE,...other
});
export class ServerSealBoundary {
  #preseal=createAtomicPresealInventory();
  constructor(_options={}){
    // The old Grok constructor accepted self-declared booleans such as
    // externalTrustRootAuthenticated:true/privilegedImporterVerified:true.
    // All such flags are ignored: they do NOT authenticate an authority.
  }
  attemptSeal(_inventory){
    return review(false,'REAL_PRIVILEGED_SEAL_AUTHORITY_UNAVAILABLE');
  }
  async inspectLocalEmulator(args={}){
    try{
      const result=await this.#preseal.inspectLocalEmulator(args);
      if(!result.ok)
        return review(false,'EMULATOR_PRESEAL_DIAGNOSTIC_DENIED',{
          issues:Array.isArray(result.issues)?structuredClone(result.issues):[result.reason]
        });
      return review(true,'LOCAL_RICH_INVENTORY_DIAGNOSTIC_ONLY',{
        diagnosticFullRichParity:true,
        diagnosticEpoch:result.observedEpoch,
        diagnosticMasterCount:result.inspectedMasterCount,
        diagnosticClaimCount:result.inspectedClaimCount,
        diagnosticLockStableDuringScan:result.localLeaseStableDuringScan===true
      });
    }catch(error){
      return review(false,'LOCAL_PREVIEW_ERROR: '+String(error.message||error));
    }
  }
  async seal(){
    return review(false,'REAL_PRIVILEGED_SEAL_AUTHORITY_UNAVAILABLE');
  }
  async claimProductionImporter(){
    return review(false,'REAL_PRODUCTION_IAM_NOT_VERIFIED');
  }
}
export function createServerSealBoundary(opts){
  return new ServerSealBoundary(opts);
}
