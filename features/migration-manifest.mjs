/**
 * A PRIVATE, OFFLINE source manifest for the original Fleet JSON export.
 * No browser tokens, cloud writes, Firebase calls or actual import.
 *
 * A byte count of canonical JSON is NOT a Firestore encoded document size.
 * The conservative budget may rule a snapshot OUT, never authorize one IN.
 */
import {createHash} from 'node:crypto';

export function canonicalStringify(root) {
  const seen=new WeakSet();
  function encode(value) {
    if(value===null)return 'null';
    if(typeof value==='string')return JSON.stringify(value);
    if(typeof value==='boolean')return String(value);
    if(typeof value==='number'){
      if(!Number.isFinite(value))throw TypeError('Non-finite number in source');
      return JSON.stringify(value);
    }
    if(Array.isArray(value)){
      if(seen.has(value))throw TypeError('Cyclic JSON export');
      seen.add(value);
      const items=[];
      for(let i=0;i<value.length;i++){
        if(!Object.hasOwn(value,i))throw TypeError('Sparse JSON array');
        items.push(encode(value[i]));
      }
      seen.delete(value);
      return '['+items.join(',')+']';
    }
    if(typeof value==='object'){
      if(Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null)
        throw TypeError('Non-JSON source object');
      if(seen.has(value))throw TypeError('Cyclic JSON export');
      seen.add(value);
      const values=Object.keys(value).sort().map(key=>
        JSON.stringify(key)+':'+encode(value[key]));
      seen.delete(value);
      return '{'+values.join(',')+'}';
    }
    throw TypeError('Non-JSON value in source: '+typeof value);
  }
  return encode(root);
}
const REQUIRED=['vehicles','drivers','fuelCards','contacts'];
function historyCount(list){
  return list.reduce((sum,record)=>{
    if(!record||typeof record!=='object'||Array.isArray(record))
      throw TypeError('Invalid Fleet item');
    if('history' in record&&!Array.isArray(record.history))
      throw TypeError('Invalid Fleet history array');
    return sum+(record.history?.length||0);
  },0);
}
export function createMigrationManifest(snapshot,{maxJsonBytes=800*1024}={}){
  if(!snapshot||typeof snapshot!=='object'||Array.isArray(snapshot)||
     !REQUIRED.every(key=>Array.isArray(snapshot[key])))
    throw TypeError('Original Fleet export must contain vehicles, drivers, fuelCards and contacts arrays');
  if(!Number.isSafeInteger(maxJsonBytes)||maxJsonBytes<=0)
    throw RangeError('maxJsonBytes must be a positive safe integer');
  const counts={
    vehicles:snapshot.vehicles.length,
    drivers:snapshot.drivers.length,
    fuelCards:snapshot.fuelCards.length,
    contacts:snapshot.contacts.length,
    vehicleHistory:historyCount(snapshot.vehicles),
    driverHistory:historyCount(snapshot.drivers)
  };
  historyCount(snapshot.fuelCards);
  historyCount(snapshot.contacts);
  const payload=canonicalStringify(snapshot);
  const jsonBytes=Buffer.byteLength(payload,'utf8');
  const withinConservativeJsonBudget=jsonBytes<=maxJsonBytes;
  return {
    version:1,
    algorithm:'sha256/canonical-json-recursive-sorted-keys-v1',
    sourceHash:createHash('sha256').update(payload,'utf8').digest('hex'),
    counts,
    jsonBytes,
    maxJsonBytes,
    withinConservativeJsonBudget,
    // Explicitly NOT an import authorization, even with a small snapshot.
    requiresFirestoreEncodedSizeCheck:true,
    requiresServerVerifiedSourceAndRollback:true,
    authorizedForImport:false,
    status:withinConservativeJsonBudget?'awaiting-approval':'oversize-risk'
  };
}
