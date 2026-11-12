/**
 * Fail-closed public V1 source+registry guard.
 *
 * Caller-supplied privileged isolation flags, SHA strings, signer IDs or
 * numeric registry versions are NOT authenticated authority. check() may
 * never provide an import/seal authorization from these values.
 *
 * For a real *synthetic* SDK check use inspectLocalEmulator() which executes
 * the two-Ed25519 signed source + persisted registry + fenced epoch receipt
 * under ONE Firestore transaction, NOT whole-namespace seal or real IAM.
 */
const SCOPE='SIGNED_SOURCE_HIGHWATER_DEMO_ONLY_NO_REAL_OWNER_AUTH';
const result=(ok,reason,extra={})=>({
  ...extra,ok,reason,proofScope:SCOPE,
  sealed:false,canSeal:false,authorizedForImport:false,
  productionIamVerified:false,ownerApprovalAuthenticated:false,
  externalTrustRootAuthenticityVerified:false,
  privilegedWriterIsolationVerified:false,
  externallyAuthenticatedDurableHighWaterVerified:false,
  atomicNamespaceSnapshotVerified:false
});
export class SignedSourceHighwater {
  constructor(_untrustedClaims={}){
    // Legacy externalPrivilegedIsolationVerified:true MUST NOT authenticate IAM.
  }
  check(sourceSha,registrySequence){
    if(typeof sourceSha!=='string'||!/^[a-f0-9]{64}$/.test(sourceSha)||
       !Number.isSafeInteger(registrySequence)||registrySequence<1)
      return result(false,'MALFORMED_SOURCE_PIN_OR_REGISTRY_SEQUENCE');
    return result(false,'CALLER_PROVIDED_SOURCE_AND_PRIVILEGED_FLAGS_NOT_AUTHORITY');
  }
  async inspectLocalEmulator({config,evidence}={}){
    try{
      const {createLocalSignedSourceEpochBinding}=await import(
        '../staging/imile-management/fleet/v1-local-signed-source-epoch-binding.mjs'
      );
      const checker=createLocalSignedSourceEpochBinding(config);
      const proof=await checker.inspectAndBind(evidence);
      return result(proof.ok===true,
        proof.ok?'LOCAL_TWO_SIGNATURE_FENCED_SOURCE_CONTENT_ONLY':
          'LOCAL_SOURCE_EPOCH_DENIED: '+proof.reason,{
          signedSourceAndHighwaterKnownSetTransactionVerified:
            proof.signedSourceAndHighwaterKnownSetTransactionVerified===true,
          localSignatureChainIntegrityVerified:
            proof.localSignatureChainIntegrityVerified===true,
          knownRichPairCount:proof.knownRichPairCount??null
        });
    }catch(e){
      return result(false,'LOCAL_EMULATOR_SOURCE_PROOF_ERROR: '+String(e.message||e));
    }
  }
  async seal(){return result(false,'REAL_PRIVILEGED_IAM_AND_OWNER_SEAL_UNAVAILABLE')}
}
export function createSignedSourceHighwater(config){return new SignedSourceHighwater(config)}
