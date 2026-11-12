/**
 * Local ED25519 CHAIN proof: pinned root -> root-SIGNED offline registry ->
 * listed signer key -> signer-SIGNED original full-rich source manifest.
 *
 * CRITICAL: A constructor-selected root fingerprint is NOT independently
 * authenticated as the actual business owner's root; anyone can construct
 * a self-consistent fake offline test registry. Neither the system clock nor
 * the offline revocation state is verified with a trusted production source.
 * Thus ok=true means DEMO cryptographic content binding only. Every
 * production/owner/import/seal authorization field is ALWAYS FALSE.
 *
 * No private keys, cloud credentials, IAM, Firebase writes or real user data.
 */
import {createPublicKey,createHash,verify as ed25519Verify,timingSafeEqual} from 'node:crypto';
import {canonicalStringify} from '../features/migration-manifest.mjs';
import {createSignedManifestContract} from './v1-signed-manifest-contract.mjs';

const REGISTRY_SCHEMA='imile-v1-offline-owner-signer-registry-v1';
const REGISTRY_PURPOSE='synthetic-root-signed-fleet-manifest-registry';
const SCOPE='LOCAL_SIGNED_REGISTRY_CHAIN_INTEGRITY_NOT_OWNER_AUTHORIZATION';
const HASH=/^[a-f0-9]{64}$/;
const NAME=/^[A-Za-z0-9._-]{3,80}$/;
const PROJECT=/^demo-[a-z0-9-]+$/;
const KEYS=o=>Object.keys(o);
const object=o=>o!==null&&typeof o==='object'&&!Array.isArray(o)&&
 (Object.getPrototypeOf(o)===Object.prototype||Object.getPrototypeOf(o)===null);
const exact=(o,fields)=>object(o)&&KEYS(o).length===fields.length&&
  KEYS(o).every(k=>fields.includes(k));
const fail=(reason,extra={})=>({
  ok:false,reason,proofScope:SCOPE,sealed:false,canSeal:false,
  authorizedForImport:false,productionIamVerified:false,
  privilegedImporterVerified:false,ownerApprovalAuthenticated:false,
  externalTrustRootAuthenticityVerified:false,
  authenticatedExternalSignerProvenanceVerified:false,
  registryFreshnessVerified:false,trustedClockVerified:false,
  signatureChainIntegrityVerified:false,...extra
});
const success=extra=>({
  ok:true,reason:'SYNTHETIC_ED25519_REGISTRY_AND_RICH_MANIFEST_CHAIN_ONLY',
  proofScope:SCOPE,sealed:false,canSeal:false,authorizedForImport:false,
  productionIamVerified:false,privilegedImporterVerified:false,
  ownerApprovalAuthenticated:false,externalTrustRootAuthenticityVerified:false,
  authenticatedExternalSignerProvenanceVerified:false,
  registryFreshnessVerified:false,trustedClockVerified:false,
  signatureChainIntegrityVerified:true,...extra
});
const safeKey=encoded=>{
  if(typeof encoded!=='string'||encoded.length<40||encoded.length>1024||
    encoded.length%4!==0||!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded))
    throw Error('INVALID_CANONICAL_ED25519_KEY');
  const bytes=Buffer.from(encoded,'base64');
  if(bytes.toString('base64')!==encoded)
    throw Error('NONCANONICAL_BASE64_KEY');
  const key=createPublicKey({key:bytes,format:'der',type:'spki'});
  if(key.asymmetricKeyType!=='ed25519')
    throw Error('ROOT_OR_SIGNER_MUST_BE_ED25519');
  const canonical=key.export({format:'der',type:'spki'});
  if(!canonical.equals(bytes))
    throw Error('NONCANONICAL_SPKI_KEY');
  return {key,fingerprint:createHash('sha256').update(bytes).digest('hex')};
};
const sigBytes=b64=>{
  if(typeof b64!=='string'||b64.length!==88)
    throw Error('INVALID_ED25519_SIGNATURE_ENCODING');
  const b=Buffer.from(b64,'base64');
  if(b.length!==64||b.toString('base64')!==b64)
    throw Error('NONCANONICAL_ED25519_SIGNATURE');
  return b;
};
const sameDigest=(a,b)=>HASH.test(a||'')&&HASH.test(b||'')&&
  timingSafeEqual(Buffer.from(a,'hex'),Buffer.from(b,'hex'));
const validTime=n=>Number.isSafeInteger(n)&&n>=0;

export class TrustedSignerContract {
  #root=null;#pinnedRootSha;#project;#audience;#signer;
  #pin;#revision;#minSequence;#minKeyVersion;
  #seenSeq=0;#seenRegistryDigest=null;
  constructor({
    rootPublicKeySpkiBase64=null,
    independentlyPinnedRootSha256=null,
    expectedRegistryAudience='demo-imile-v1-owner-registry',
    expectedProjectId='demo-imile-v1-manifest',
    expectedSignerId='local-test-owner',
    independentlyPinnedSourceSha256=null,
    expectedSourceRevision=1,
    minimumTrustedRegistrySequence=1,
    minimumSignerKeyVersion=1
  }={}){
    if(!PROJECT.test(expectedRegistryAudience)||!PROJECT.test(expectedProjectId)||
      !NAME.test(expectedSignerId)||!Number.isSafeInteger(expectedSourceRevision)||
      expectedSourceRevision<1||!Number.isSafeInteger(minimumTrustedRegistrySequence)||
      minimumTrustedRegistrySequence<1||!Number.isSafeInteger(minimumSignerKeyVersion)||
      minimumSignerKeyVersion<1)
      throw Error('DEMO_AUDIENCE_SIGNER_AND_PINNED_VERSION_REQUIRED');
    this.#project=expectedProjectId;this.#audience=expectedRegistryAudience;
    this.#signer=expectedSignerId;this.#revision=expectedSourceRevision;
    this.#minSequence=minimumTrustedRegistrySequence;
    this.#minKeyVersion=minimumSignerKeyVersion;
    if(independentlyPinnedSourceSha256!==null&&
      !HASH.test(independentlyPinnedSourceSha256))
      throw Error('SOURCE_SHA_PIN_INVALID');
    this.#pin=independentlyPinnedSourceSha256;
    if(rootPublicKeySpkiBase64!==null||independentlyPinnedRootSha256!==null){
      if(!HASH.test(independentlyPinnedRootSha256||''))
        throw Error('INDEPENDENT_ROOT_FINGERPRINT_REQUIRED');
      let key;
      try{key=safeKey(rootPublicKeySpkiBase64)}
      catch(e){throw Error('INVALID_PINNED_ED25519_ROOT: '+String(e.message||e))}
      if(!sameDigest(key.fingerprint,independentlyPinnedRootSha256))
        throw Error('PINNED_OWNER_ROOT_FINGERPRINT_MISMATCH');
      this.#root=key.key;
      this.#pinnedRootSha=key.fingerprint;
    }
  }
  verify(input){
    if(arguments.length!==1||!exact(input,['registryBundle','manifest','snapshot','backup']))
      return fail('UNTRUSTED_CALLER_AUTHORITY_OR_MISSING_SOURCE_FIELDS');
    if(!this.#root)return fail('NO_EXTERNAL_OWNER_REGISTRY_ROOT');
    if(!exact(input.registryBundle,['algorithm','payload','signatureBase64'])||
      input.registryBundle.algorithm!=='Ed25519')
      return fail('INVALID_OWNER_REGISTRY_ENVELOPE');
    const r=input.registryBundle.payload;
    if(!exact(r,[
      'schema','purpose','registryAudience','sourceProjectId','sequence',
      'notBeforeMs','expiresAtMs','signers','revokedSignerFingerprints'
    ]))return fail('INVALID_OWNER_REGISTRY_FIELDS');
    if(r.schema!==REGISTRY_SCHEMA||r.purpose!==REGISTRY_PURPOSE||
      r.registryAudience!==this.#audience||r.sourceProjectId!==this.#project||
      !Number.isSafeInteger(r.sequence)||r.sequence<this.#minSequence||
      !validTime(r.notBeforeMs)||!validTime(r.expiresAtMs)||
      r.expiresAtMs<=r.notBeforeMs||!Array.isArray(r.signers)||
      r.signers.length<1||r.signers.length>64||
      !Array.isArray(r.revokedSignerFingerprints)||
      r.revokedSignerFingerprints.length>128||
      r.revokedSignerFingerprints.some(v=>!HASH.test(v))||
      new Set(r.revokedSignerFingerprints).size!==r.revokedSignerFingerprints.length)
      return fail('SIGNED_REGISTRY_CONTEXT_REVISION_OR_REVOCATION_INVALID');
    try{
      const registryDigest=createHash('sha256').update(canonicalStringify(r)).digest('hex');
      const verified=ed25519Verify(
        null,Buffer.from(canonicalStringify(r),'utf8'),
        this.#root,sigBytes(input.registryBundle.signatureBase64)
      );
      if(!verified)return fail('REGISTRY_ED25519_SIGNATURE_INVALID');
      // Date.now is LOCAL system time, not a trusted production clock;
      // verification accepts no caller-supplied time option or override.
      const now=Date.now();
      if(!validTime(now)||now<r.notBeforeMs||now>=r.expiresAtMs)
        return fail('REGISTRY_EXPIRED_OR_NOT_YET_VALID');
      if(r.sequence<this.#seenSeq||
         (r.sequence===this.#seenSeq&&
           this.#seenRegistryDigest!==registryDigest))
        return fail('LOCAL_REGISTRY_REPLAY_OR_EQUIVOCATION_DENIED');

      const versions=new Set(),signerFps=new Set(),matches=[];
      for(const entry of r.signers){
        if(!exact(entry,[
          'signerId','keyVersion','publicKeySpkiBase64','status',
          'notBeforeMs','expiresAtMs'
        ])||!NAME.test(entry.signerId)||
          !Number.isSafeInteger(entry.keyVersion)||entry.keyVersion<1||
          !['active','disabled'].includes(entry.status)||
          !validTime(entry.notBeforeMs)||!validTime(entry.expiresAtMs)||
          entry.expiresAtMs<=entry.notBeforeMs||
          entry.notBeforeMs<r.notBeforeMs||entry.expiresAtMs>r.expiresAtMs)
          return fail('SIGNED_REGISTRY_SIGNER_ENTRY_INVALID');
        const versionKey=entry.signerId+':'+entry.keyVersion;
        if(versions.has(versionKey))return fail('DUPLICATE_SIGNER_AND_KEY_VERSION');
        versions.add(versionKey);
        let key;
        try{key=safeKey(entry.publicKeySpkiBase64)}
        catch{return fail('MALFORMED_REGISTRY_SIGNER_PUBLIC_KEY')}
        if(signerFps.has(key.fingerprint))
          return fail('DUPLICATE_SIGNER_FINGERPRINT');
        signerFps.add(key.fingerprint);
        if(entry.signerId===this.#signer)
          matches.push({...entry,fingerprint:key.fingerprint});
      }
      // A higher root-signed registry is authoritative for this SINGLE
      // in-memory TEST instance even if its signer is now revoked/disabled.
      // Never allow fallback to an earlier active registry after seeing
      // an authentic newer revocation. No persistence across restarts.
      if(r.sequence>this.#seenSeq){
        this.#seenSeq=r.sequence;
        this.#seenRegistryDigest=registryDigest;
      }
      if(matches.length===0)return fail('SIGNER_ID_MISMATCH_EXTERNAL_REGISTRY');
      const current=matches.reduce((a,b)=>
        !a||b.keyVersion>a.keyVersion?b:a,null);
      // Older signer keys MUST NOT become valid after key rotation.
      if(current.keyVersion<this.#minKeyVersion)
        return fail('SIGNER_KEY_VERSION_BELOW_PINNED_FLOOR');
      if(current.status!=='active'||now<current.notBeforeMs||
        now>=current.expiresAtMs||
        r.revokedSignerFingerprints.includes(current.fingerprint))
        return fail('SIGNER_EXPIRED_DISABLED_OR_REVOKED');
      if(!exact(input.manifest,['algorithm','payload','signatureBase64'])||
        !exact(input.manifest.payload,[
          'schema','purpose','signerId','projectId','sourceSha256',
          'sourceRevision','canonicalPlanDigest'
        ])||input.manifest.payload.signerId!==this.#signer||
        input.manifest.payload.projectId!==this.#project)
        return fail('SOURCE_MANIFEST_SIGNER_OR_AUDIENCE_MISMATCH');

      const contract=createSignedManifestContract({
        trustedPublicKeySpkiBase64:current.publicKeySpkiBase64,
        expectedSignerId:this.#signer,expectedProjectId:this.#project,
        expectedRevision:this.#revision,
        independentlyPinnedSourceSha256:this.#pin
      });
      const sourceProof=contract.verify(input.snapshot,input.manifest,{
        backup:input.backup
      });
      if(!sourceProof.ok)return fail(
        'RICH_SOURCE_MANIFEST_SIGNATURE_OR_BACKUP_DENIED: '+sourceProof.reason
      );
      // Registry high water already updated on valid signed registry.
      return success({
        localRootFingerprint:this.#pinnedRootSha,
        localRegistrySequence:r.sequence,
        localSignerKeyVersion:current.keyVersion,
        localSignerFingerprint:current.fingerprint,
        fullRichSourceSha256:sourceProof.sourceSha256,
        expectedKeyedMasterCount:sourceProof.expectedKeyedMasterCount
      });
    }catch(e){
      return fail('INVALID_OFFLINE_SIGNER_REGISTRY_OR_SOURCE: '+String(e.message||e));
    }
  }
}
export function createTrustedSignerContract(opts){
  return new TrustedSignerContract(opts);
}
