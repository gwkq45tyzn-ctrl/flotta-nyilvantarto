/** Content gate for a registry checkpoint OUTSIDE the database writer boundary.
 * The path, byte pin, root and verifier deployment must be managed by another
 * principal. This module cannot prove that separation or real owner identity.
 * Exact approved snapshot only: no TOFU, newer-state fallback or DB recovery.
 */
import {createHash} from 'node:crypto';
import {isAbsolute} from 'node:path';
import {readStrictPrivateUtf8File} from './v1-private-utf8-read.mjs';
import {canonicalStringify} from '../features/migration-manifest.mjs';
const HEX=/^[a-f0-9]{64}$/;
export function createIndependentRegistryFloor({
  independentRegistryPath,independentlyPinnedRegistrySha256
}={}){
  if(independentRegistryPath===undefined&&independentlyPinnedRegistrySha256===undefined)
    return null; // Legacy synthetic counterexample remains testable, NEVER production authority.
  if(typeof independentRegistryPath!=='string'||!isAbsolute(independentRegistryPath)||
      typeof independentlyPinnedRegistrySha256!=='string'||!HEX.test(independentlyPinnedRegistrySha256))
    throw Error('INDEPENDENT_REGISTRY_PATH_AND_BYTE_PIN_REQUIRED');
  // Capture primitives privately; never accept per-call replacement authority.
  const path=independentRegistryPath,pin=independentlyPinnedRegistrySha256;
  return Object.freeze({assertCurrentRegistry(bundle){
    try{
      const text=readStrictPrivateUtf8File(path,256*1024);
      if(createHash('sha256').update(text,'utf8').digest('hex')!==pin)
        throw Error();
      if(canonicalStringify(JSON.parse(text))!==canonicalStringify(bundle))
        throw Error();
    }catch{throw Error('INDEPENDENT_REGISTRY_CHECKPOINT_DENIED');}
    // This is a content equality check. Ed25519, context, expiry, revocation
    // and source manifest validation MUST still run in the enclosing verifier.
  }});
}
