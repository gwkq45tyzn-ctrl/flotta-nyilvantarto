/**
 * Demonstration-only server seal boundary, never actual authorized seal.
 *
 * The only new positive proof is an explicitly BOUNDED, source-derived,
 * known-write-set transaction in a DEMO Firebase emulator; an external
 * privileged writer can add unknown/out-of-plan docs or alter the source
 * after this read. Neither this proof nor a four-collection ordinary scan
 * can establish whole-namespace atomicity, trusted provenance or IAM.
 *
 * No main/prod deploy or seal occurs through this module. Original privileged
 * poisoned-source/index-zero booking P0 remains a blocking release NO-GO.
 */
import {createServerSealBoundary} from './v1-server-seal-boundary.mjs';

const SCOPE='LOCAL_BOUNDED_KNOWNSET_READ_ONLY_NO_PRODUCTION_AUTHORITY';
const verdict=(ok,reason,extra={})=>({
  ...extra,ok,reason,sealed:false,canSeal:false,
  authorizedForImport:false,productionIamVerified:false,
  externalSignerAuthenticated:false,externalTrustRootAuthenticityVerified:false,
  ownerApprovalAuthenticated:false,privilegedImporterVerified:false,
  closedWriterSetVerified:false,atomicNamespaceSnapshotVerified:false,
  proofScope:SCOPE
});

export class ServerOnlySeal {
  #preview=createServerSealBoundary();
  constructor(_claimedSignerOrPrivilegedFlags={}){
    // All caller-supplied root/IAM/approval flags are ignored.
  }
  attemptSeal(_observation){
    return verdict(false,'SERVER_ONLY_RELEASE_AUTHORITY_MISSING');
  }
  async seal(_candidate){
    return verdict(false,'SERVER_ONLY_RELEASE_AUTHORITY_MISSING');
  }
  async inspectLocalEmulator(args={}){
    const r=await this.#preview.inspectLocalEmulator(args);
    return verdict(r.ok===true,r.ok?
      'NONATOMIC_NAMESPACE_DIAGNOSTIC_ONLY':
      'NONATOMIC_NAMESPACE_DIAGNOSTIC_DENIED',{
      issues:r.issues||[],
      diagnosticMasterCount:r.diagnosticMasterCount,
      diagnosticClaimCount:r.diagnosticClaimCount
    });
  }
  async inspectBoundedKnownSet(args={}){
    try{
      // Offline tests don't require the staging-only local Firebase SDK.
      const {inspectLocalDemoKnownWriteSet}=await import(
        '../staging/imile-management/fleet/v1-local-knownset-transaction.mjs'
      );
      const r=await inspectLocalDemoKnownWriteSet(args);
      return verdict(r.ok===true,r.reason,r);
    }catch(e){
      return verdict(false,'LOCAL_KNOWNSET_INSPECTION_FAILED: '+String(e.message||e));
    }
  }
}
export function createServerOnlySeal(opts){
  return new ServerOnlySeal(opts);
}
