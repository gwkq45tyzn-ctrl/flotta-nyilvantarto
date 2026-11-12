/**
 * LOCAL cryptographic PUBLIC trust-root material / lifecycle gate.
 *
 * This module verifies a candidate Ed25519 SPKI key against a *separately*
 * configured immutable SHA-256 fingerprint, offline revocation snapshot,
 * version and validity window. No text-equality shortcut; no caller-
 * supplied time, pin, expiry, revocation bypass, or raw arbitrary key.
 *
 * A caller can construct its OWN registry with a self-chosen key+fingerprint.
 * Therefore external ROOT AUTHENTICITY, actual revocation FRESHNESS,
 * owner approval, trusted clock, production IAM and seal remain FALSE.
 * A public key match does NOT verify a manifest signature; use the
 * independent Ed25519 SignedManifestContract for content authenticity.
 */
import {createPublicKey,createHash,timingSafeEqual} from 'node:crypto';

const HEX=/^[a-f0-9]{64}$/;
const PUB_B64=/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const PROOF='LOCAL_PINNED_PUBLIC_KEY_LIFECYCLE_ONLY';
const deny=(reason)=>({
  ok:false,reason,authorizedForImport:false,sealed:false,canSeal:false,
  productionIamVerified:false,ownerApprovalAuthenticated:false,
  externalTrustRootAuthenticityVerified:false,revocationFreshnessVerified:false,
  trustedClockVerified:false,signatureIntegrityVerified:false,proofScope:PROOF
});
const allow=fields=>({
  ok:true,reason:'LOCAL_ED25519_FINGERPRINT_AND_OFFLINE_LIFECYCLE_MATCH_ONLY',
  authorizedForImport:false,sealed:false,canSeal:false,
  productionIamVerified:false,ownerApprovalAuthenticated:false,
  externalTrustRootAuthenticityVerified:false,revocationFreshnessVerified:false,
  trustedClockVerified:false,signatureIntegrityVerified:false,proofScope:PROOF,
  ...fields
});
const isPlain=o=>o!==null&&typeof o==='object'&&!Array.isArray(o)&&
  (Object.getPrototypeOf(o)===Object.prototype||
   Object.getPrototypeOf(o)===null);
const keyMaterial=spkiBase64=>{
  if(typeof spkiBase64!=='string'||spkiBase64.length<40||
     spkiBase64.length>1024||spkiBase64.length%4!==0||
     !PUB_B64.test(spkiBase64))throw Error('INVALID_ED25519_SPKI_BASE64');
  const bytes=Buffer.from(spkiBase64,'base64');
  if(bytes.toString('base64')!==spkiBase64)
    throw Error('NONCANONICAL_PUBLIC_KEY_ENCODING');
  const publicKey=createPublicKey({key:bytes,format:'der',type:'spki'});
  if(publicKey.asymmetricKeyType!=='ed25519')
    throw Error('PUBLIC_KEY_MUST_BE_ED25519');
  const der=publicKey.export({format:'der',type:'spki'});
  return {
    spkiBase64:der.toString('base64'),
    fingerprint:createHash('sha256').update(der).digest('hex')
  };
};
const equalDigest=(a,b)=>HEX.test(a||'')&&HEX.test(b||'')&&
  timingSafeEqual(Buffer.from(a,'hex'),Buffer.from(b,'hex'));

export class TrustRootBootstrap {
  #root=null;#fingerprint=null;#validFrom=null;#expires=null;
  #revoked=new Set();#registryVersion=null;
  constructor(config={}){
    if(!isPlain(config))throw Error('TRUST_ROOT_CONFIG_MUST_BE_PLAIN');
    const accepted=new Set([
      'trustedPublicKeySpkiBase64','independentlyPinnedPublicKeySha256',
      'validFromMs','expiresAtMs','revokedFingerprints','registryVersion'
    ]);
    if(Object.keys(config).some(k=>!accepted.has(k)))
      throw Error('UNTRUSTED_ROOT_CONFIG_OVERRIDE');
    // No configuration is a valid fail-closed constructor, NOT trust.
    if(Object.keys(config).length===0)return;
    const {
      trustedPublicKeySpkiBase64,
      independentlyPinnedPublicKeySha256,
      validFromMs,expiresAtMs,revokedFingerprints=[],
      registryVersion
    }=config;
    if(!HEX.test(independentlyPinnedPublicKeySha256||''))
      throw Error('INDEPENDENT_TRUST_ROOT_FINGERPRINT_REQUIRED');
    if(!Number.isSafeInteger(validFromMs)||
       !Number.isSafeInteger(expiresAtMs)||
       validFromMs<0||expiresAtMs<=validFromMs)
      throw Error('EXPLICIT_ROOT_VALIDITY_WINDOW_REQUIRED');
    if(!Number.isSafeInteger(registryVersion)||registryVersion<1)
      throw Error('PINNED_REGISTRY_VERSION_REQUIRED');
    if(!Array.isArray(revokedFingerprints)||
       revokedFingerprints.some(x=>!HEX.test(x))||
       new Set(revokedFingerprints).size!==revokedFingerprints.length)
      throw Error('MALFORMED_OFFLINE_REVOCATION_SET');
    let key;
    try{key=keyMaterial(trustedPublicKeySpkiBase64)}
    catch(e){throw Error('INVALID_TRUST_ROOT_KEY: '+String(e.message||e))}
    if(!equalDigest(key.fingerprint,independentlyPinnedPublicKeySha256))
      throw Error('TRUST_ROOT_PIN_MISMATCH');
    this.#root=key.spkiBase64;
    this.#fingerprint=key.fingerprint;
    this.#validFrom=validFromMs;
    this.#expires=expiresAtMs;
    this.#revoked=new Set(revokedFingerprints);
    this.#registryVersion=registryVersion;
  }
  verify(candidatePublicKey,options){
    // Explicitly NO now override, no caller-provided revocation, pin or IAM.
    if(arguments.length!==1)return deny('CALLER_SUPPLIED_CLOCK_OR_AUTHORITY_DENIED');
    if(this.#root===null)return deny('NO_INDEPENDENTLY_CONFIGURED_PUBLIC_ROOT');
    let candidate;
    try{candidate=keyMaterial(candidatePublicKey)}
    catch{return deny('INVALID_CANDIDATE_ED25519_KEY')}
    if(!equalDigest(candidate.fingerprint,this.#fingerprint))
      return deny('CANDIDATE_PUBLIC_KEY_PIN_MISMATCH');
    if(this.#revoked.has(candidate.fingerprint))
      return deny('ROOT_REVOKED_IN_OFFLINE_REGISTRY_SNAPSHOT');
    const now=Date.now(); // Local system clock, NOT trusted production time
    if(!Number.isSafeInteger(now)||now<this.#validFrom)
      return deny('ROOT_NOT_YET_VALID_OR_CLOCK_INVALID');
    if(now>=this.#expires)return deny('ROOT_EXPIRED');
    return allow({fingerprint:this.#fingerprint,registryVersion:this.#registryVersion,
      notAfterMs:this.#expires});
  }
}
export function createTrustRootBootstrap(opts){return new TrustRootBootstrap(opts);}
