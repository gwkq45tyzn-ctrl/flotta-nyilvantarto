/**
 * Strict NO-SEAL public facade. A caller-supplied isolation boolean or a
 * 440 count is never a signed source, a privileged identity or authority.
 *
 * Actual original-Rules local DEMO Firestore implementation lives in
 * staging/imile-management/fleet/v1-local-440-signed-chunk-receipts.mjs.
 */
const SCOPE='DEMO_440_SIGNED_SOURCE_RECEIPTS_NO_PRODUCTION_SEAL';
const denied=(reason,rest={})=>({
  ...rest,ok:false,reason,sealed:false,canSeal:false,
  authorizedForImport:false,productionIamVerified:false,
  privilegedWriterIsolationVerified:false,
  externalTrustRootAuthenticityVerified:false,
  atomicNamespaceSnapshotVerified:false,proofScope:SCOPE
});
export class BoundedSignedReceipt {
  constructor(_untrustedFlags={}){
    // No self-reported externalPrivilegedIsolationVerified can confer trust.
  }
  check(totalPairs,chunkSize=24){
    if(!Number.isSafeInteger(totalPairs)||totalPairs<1)
      return denied('INVALID_RICH_PAIR_COUNT');
    if(totalPairs>440)return denied('EXCEEDS_440_LIMIT');
    if(!Number.isSafeInteger(chunkSize)||chunkSize<1||chunkSize>24)
      return denied('INVALID_CHUNK_SIZE_MAX_24');
    return denied('UNTRUSTED_COUNT_OR_ISOLATION_FLAG_CANNOT_AUTHORIZE_SIGNED_RECEIPT',{
      expectedChunks:Math.ceil(totalPairs/chunkSize)
    });
  }
  async inspectLocalDemoChunk(config,evidence,index){
    try{
      const {createLocal440SignedChunkReceipts}=await import(
        '../staging/imile-management/fleet/v1-local-440-signed-chunk-receipts.mjs'
      );
      const result=await createLocal440SignedChunkReceipts(config).recordChunk(
        evidence,index
      );
      return {...denied(result.ok?
        'SIGNED_440_LOCAL_CHUNK_CONTENT_ONLY':'SIGNED_440_CHUNK_DENIED: '+result.reason),...result,
        canSeal:false,authorizedForImport:false,
        productionIamVerified:false,privilegedWriterIsolationVerified:false,
        atomicNamespaceSnapshotVerified:false};
    }catch(e){
      return denied('LOCAL_EMULATOR_440_CHUNK_FAILED: '+String(e.message||e));
    }
  }
  async seal(){return denied('NO_PRIVILEGED_WRITER_ISOLATION_OR_AUTHENTIC_OWNER_ROOT')}
}
export function createBoundedSignedReceipt(options){
  return new BoundedSignedReceipt(options);
}
