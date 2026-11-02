import {PHOTO_KEYS} from './core.mjs';
export function photoProofMatches(proof,{uid,sessionId,stage,paths}){
 return !!proof&&proof.uid===uid&&proof.sessionId===sessionId&&proof.stage===stage&&
  proof.source==='storage-verifier-v1'&&proof.verified===true&&
  typeof proof.verifiedAt?.toMillis==='function'&&
  Number.isFinite(proof.verifiedAt.toMillis())&&proof.verifiedAt.toMillis()<=Date.now()&&
  proof.paths&&Object.keys(proof.paths).length===7&&
  PHOTO_KEYS.every(k=>proof.paths[k]===paths[k]);
}
