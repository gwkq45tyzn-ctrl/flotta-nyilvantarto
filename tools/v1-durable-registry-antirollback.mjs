/**
 * OFFLINE guard: no caller-supplied integer can be authenticated as a
 * persisted/owner-authorized high-water. Never return "ok" on a bare
 * externalHighWater passed to constructor.
 *
 * Genuine LOCAL Firestore emulator implementation:
 * ../staging/imile-management/fleet/v1-local-durable-signed-registry.mjs
 * (still subject to fake root and arbitrary privileged Admin SDK bypass).
 */
const SCOPE='OFFLINE_CALLER_HIGHWATER_NOT_DURABLE_AUTHORITY';
const deny=reason=>({
  ok:false,reason,sealed:false,canSeal:false,authorizedForImport:false,
  productionIamVerified:false,ownerApprovalAuthenticated:false,
  externalTrustRootAuthenticityVerified:false,
  externallyAuthenticatedDurableHighWaterVerified:false,
  privilegedWriterIsolationVerified:false,proofScope:SCOPE
});
export class DurableRegistryAntirollback {
  #untrusted;
  constructor(options={}){
    if(options===null||typeof options!=='object'||Array.isArray(options))
      throw Error('INVALID_UNTRUSTED_HIGHWATER_OPTIONS');
    // Even a beautifully formatted integer here is CALLER CONTROLLED.
    this.#untrusted=Object.prototype.hasOwnProperty.call(
      options,'externalHighWater'
    );
  }
  check(registrySequence){
    if(!Number.isSafeInteger(registrySequence)||registrySequence<1)
      return deny('INVALID_SIGNED_REGISTRY_SEQUENCE');
    if(this.#untrusted)
      return deny('CALLER_SUPPLIED_HIGHWATER_IS_NOT_DURABLE_PROOF');
    return deny('NO_EXTERNAL_AUTHENTICATED_DURABLE_HIGHWATER');
  }
  async seal(){return deny('PRODUCTION_SEAL_UNAVAILABLE')}
}
export function createDurableRegistryAntirollback(options){
  return new DurableRegistryAntirollback(options);
}
