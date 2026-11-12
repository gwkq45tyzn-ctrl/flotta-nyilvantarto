/**
 * Actual cryptographic Ed25519 verification of a *LOCAL TEST* Fleet manifest.
 *
 * Public verification key may be distributed publicly; the Ed25519 private
 * signing key is NOT the trust root and is never passed to verify().
 * Merely passing an arbitrary public key to this constructor is NOT proof
 * that the key is trusted by the real business owner. That independent
 * owner-approved trust-anchor registration does not yet exist.
 *
 * This is a demonstration of SIGNATURE INTEGRITY, NOT real source-origin
 * provenance, production IAM, migration authorization, seal, or deployment.
 * This class never signs and never writes anything.
 */
import {createPublicKey,verify as cryptoVerify} from 'node:crypto';
import {sha256} from './v1-migration-dryrun.mjs';
import {verifyPinnedImportSource} from './v1-pinned-backup-trust.mjs';
import {canonicalStringify} from '../features/migration-manifest.mjs';

const SCOPE='LOCAL_ED25519_SIGNATURE_INTEGRITY_ONLY_NO_EXTERNAL_TRUST_ROOT_PROVENANCE';
const FORMAT='imile-v1-offline-fleet-manifest-v1';
const PURPOSE='synthetic-preseal-dry-run';
const keysEqual=(object,keys)=>{
  if(!object||typeof object!=='object'||Array.isArray(object)||
     (Object.getPrototypeOf(object)!==Object.prototype&&
      Object.getPrototypeOf(object)!==null))return false;
  const found=Object.keys(object);
  return found.length===keys.length&&found.every(k=>keys.includes(k));
};
const deny=(reason,extra={})=>({
  ok:false,reason,sealed:false,canSeal:false,authorizedForImport:false,
  productionIamVerified:false,ownerApprovalAuthenticated:false,
  externalTrustRootAuthenticityVerified:false,
  authenticatedExternalSignerProvenanceVerified:false,
  signatureIntegrityVerified:false,proofScope:SCOPE,...extra
});
const success=extra=>({
  ok:true,reason:'ED25519_SIGNATURE_AND_FULL_RICH_CONTENT_INTEGRITY_ONLY',
  sealed:false,canSeal:false,authorizedForImport:false,
  productionIamVerified:false,ownerApprovalAuthenticated:false,
  externalTrustRootAuthenticityVerified:false,
  authenticatedExternalSignerProvenanceVerified:false,
  signatureIntegrityVerified:true,proofScope:SCOPE,...extra
});
const b64=s=>typeof s==='string'&&s.length>30&&s.length<5000&&
  s.length%4===0&&/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(s);

export class SignedManifestContract {
  #publicKey=null;#signerId;#projectId;#revision;#pin;
  constructor({
    trustedPublicKeySpkiBase64=null,
    expectedSignerId='local-test-owner',
    expectedProjectId='demo-imile-v1-manifest',
    expectedRevision=1,
    independentlyPinnedSourceSha256=null
  }={}){
    if(!/^demo-[a-z0-9-]+$/.test(expectedProjectId)||
      typeof expectedSignerId!=='string'||
      !/^[A-Za-z0-9._-]{3,80}$/.test(expectedSignerId)||
      !Number.isSafeInteger(expectedRevision)||expectedRevision<1)
      throw Error('DEMO_PROJECT_SIGNER_AND_REVISION_REQUIRED');
    if(independentlyPinnedSourceSha256!==null&&
      !/^[a-f0-9]{64}$/.test(independentlyPinnedSourceSha256))
      throw Error('SOURCE_SHA_PIN_MALFORMED');
    this.#signerId=expectedSignerId;
    this.#projectId=expectedProjectId;
    this.#revision=expectedRevision;
    this.#pin=independentlyPinnedSourceSha256;
    if(trustedPublicKeySpkiBase64!==null){
      if(!b64(trustedPublicKeySpkiBase64))throw Error('INVALID_ED25519_PUBLIC_ROOT');
      try{
        const key=createPublicKey({
          key:Buffer.from(trustedPublicKeySpkiBase64,'base64'),
          format:'der',type:'spki'
        });
        if(key.asymmetricKeyType!=='ed25519')throw Error('PUBLIC_ROOT_NOT_ED25519');
        this.#publicKey=key;
      }catch(e){throw Error('INVALID_ED25519_PUBLIC_ROOT: '+String(e.message||e))}
    }
  }

  verify(snapshot,manifest,{backup}={}){
    if(!this.#publicKey)return deny('NO_EXTERNAL_TRUST_ROOT');
    if(!keysEqual(manifest,['algorithm','payload','signatureBase64'])||
      manifest.algorithm!=='Ed25519'||!b64(manifest.signatureBase64))
      return deny('INVALID_SIGNED_MANIFEST_ENVELOPE');
    const payload=manifest.payload;
    if(!keysEqual(payload,[
      'schema','purpose','signerId','projectId','sourceSha256',
      'sourceRevision','canonicalPlanDigest'
    ]))return deny('INVALID_SIGNED_PAYLOAD_FIELDS');
    if(payload.schema!==FORMAT||payload.purpose!==PURPOSE||
       payload.signerId!==this.#signerId||
       payload.projectId!==this.#projectId||
       payload.sourceRevision!==this.#revision||
       !/^[a-f0-9]{64}$/.test(payload.sourceSha256||'')||
       !/^[a-f0-9]{64}$/.test(payload.canonicalPlanDigest||''))
      return deny('SIGNED_PAYLOAD_CONTEXT_MISMATCH');
    if(this.#pin!==null&&payload.sourceSha256!==this.#pin)
      return deny('INDEPENDENT_SOURCE_PIN_MISMATCH');
    try{
      const data=Buffer.from(canonicalStringify(payload),'utf8');
      const signature=Buffer.from(manifest.signatureBase64,'base64');
      if(signature.length!==64||
        !cryptoVerify(null,data,this.#publicKey,signature))
        return deny('ED25519_SIGNATURE_VERIFICATION_FAILED');
      const sourceSha256=sha256(snapshot);
      if(sourceSha256!==payload.sourceSha256)
        return deny('SOURCE_SHA_MISMATCH');
      const proof=verifyPinnedImportSource({
        backup,trustedPinnedSha:payload.sourceSha256,
        expectedRevision:this.#revision
      });
      if(!proof.ok)return deny('PINNED_RICH_SOURCE_DENIED: '+proof.reason);
      const keys=[
        ...proof.plan.drivers.map(x=>'drivers/'+x.id),
        ...proof.plan.vehicles.map(x=>'vehicles/'+x.id)
      ].sort();
      if(sha256(keys)!==payload.canonicalPlanDigest)
        return deny('PLAN_DIGEST_MISMATCH_SIGNED_PAYLOAD');
      return success({
        sourceSha256,pinnedRevision:this.#revision,
        expectedKeyedMasterCount:keys.length,
        canonicalPlanDigest:payload.canonicalPlanDigest
      });
    }catch(e){
      return deny('MALFORMED_SIGNATURE_OR_SOURCE: '+String(e.message||e));
    }
  }
}
export function createSignedManifestContract(opts){
  return new SignedManifestContract(opts);
}
