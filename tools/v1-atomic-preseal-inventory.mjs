/**
 * Fail-closed pre-seal readiness review (NOT "atomic namespace inventory").
 *
 * A four-collection Firestore SDK scan cannot be made transactional simply
 * by comparing a lease epoch before and after. In particular privileged
 * out-of-plan writes may occur immediately AFTER a successful scan. The
 * only production-safe path would be a trusted privileged service that
 * controls ALL writers and seals against an independently verified source
 * with enforceable server-side fencing. None of that is available here.
 *
 * check(): always rejects self-asserted observations, counts and flags.
 * inspectLocalEmulator(): actually executes the SDK+rich content parity
 * collector in a separately named demo emulator, producing OPTIONAL
 * diagnostic readiness for HUMAN review only; never returns seal rights.
 */
const SCOPE='LOCAL_NON_ATOMIC_PRESEAL_REVIEW_ONLY';
const fail=(reason,extra={})=>({
  ok:false,reason,canSeal:false,sealed:false,authorizedForImport:false,
  atomicNamespaceSnapshotVerified:false,externalTrustRootAuthenticityVerified:false,
  sourceSignerProvenanceVerified:false,productionIamVerified:false,
  privilegedImporterVerified:false,proofScope:SCOPE,...extra
});
const pass=(extra={})=>({
  ok:true,reason:'NONATOMIC_LOCAL_PRESEAL_CONTENT_REVIEW_ONLY',
  canSeal:false,sealed:false,authorizedForImport:false,
  atomicNamespaceSnapshotVerified:false,externalTrustRootAuthenticityVerified:false,
  sourceSignerProvenanceVerified:false,productionIamVerified:false,
  privilegedImporterVerified:false,proofScope:SCOPE,...extra
});
export class AtomicPresealInventory {
  constructor(options={}){
    // Legacy "trustRootAuthenticated:true" cannot act as a trust source.
    if(options!==null&&typeof options!=='object')
      throw Error('INVALID_PRESEAL_OPTIONS');
  }
  check(observed,expectedCount){
    // Self-supplied observations are not evidence of whole-namespace
    // state, even when count, hashes and epoch appear correct.
    return fail('UNTRUSTED_OR_NONATOMIC_CLIENT_OBSERVATION_CANNOT_SEAL');
  }
  async inspectLocalEmulator({db,projectId,plan,expectedEpoch}={}){
    try{
      // Dynamic import permits offline negative tests without staging SDK.
      const {observeLocalEmulatorKeyedInventory}=await import(
        '../staging/imile-management/fleet/v1-local-keyed-namespace-inventory.mjs'
      );
      const result=await observeLocalEmulatorKeyedInventory({
        db,projectId,plan,expectedEpoch
      });
      if(!result.ok)
        return fail('LOCAL_SDK_PRESEAL_REVIEW_DENIED', {
          issues:result.issues||[result.reason],
          observedEpoch:result.verifiedEpoch??null
        });
      // Positive offline diagnostic ONLY. We cannot know whether another
      // privileged writer is inserting a poisoned doc immediately now.
      return pass({
        observedEpoch:result.verifiedEpoch,
        expectedCount:result.expectedCount,
        inspectedMasterCount:result.observedMasterCount,
        inspectedClaimCount:result.observedClaimCount,
        localRichContentParityInSampledScan:true,
        localLeaseStableDuringScan:result.stableLockDuringScan===true,
        globallyAuthoritativeNamespace:false
      });
    }catch(error){
      return fail('LOCAL_EMULATOR_PRESEAL_REVIEW_ERROR: '+String(error.message||error));
    }
  }
  async seal(){return fail('SEAL_DENIED_NO_TRUSTED_ATOMIC_PRIVILEGED_NAMESPACE')}
}
export function createAtomicPresealInventory(opts){return new AtomicPresealInventory(opts);}
