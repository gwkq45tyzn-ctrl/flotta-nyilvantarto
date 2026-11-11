/**
 * #185 conservative LOCAL V1 Firestore size/shape preflight.
 * Published Firestore document STORAGE calculation is NOT an exact SDK
 * encoded RPC or real import proof. Production import remains DENIED.
 *
 * Formula reference: https://firebase.google.com/docs/firestore/storage-size
 * Limits reference: https://firebase.google.com/docs/firestore/quotas
 * Only handles strict JSON values; Timestamp/Bytes/GeoPoint/reference
 * require separate verified handling and will fail closed.
 */
import {canonicalStringify} from '../features/migration-manifest.mjs';
export const FIRESTORE_DOC_LIMIT=1_048_576;
export const CONSERVATIVE_JSON_BUDGET=800*1024;
const FIELD_VALUE_LIMIT=FIRESTORE_DOC_LIMIT-89;
const MAX_FIELD_DEPTH=20;
const strSize=s=>Buffer.byteLength(s,'utf8')+1;
const isRecord=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&
  (Object.getPrototypeOf(v)===Object.prototype||Object.getPrototypeOf(v)===null);

export function advisoryJsonSize(obj) {
  // The original JSON.stringify silently accepted undefined fields; it
  // was not sufficient to prove the object actually written to Firestore.
  return Buffer.byteLength(canonicalStringify(obj),'utf8');
}
function validPart(part){
  return typeof part==='string'&&part!==''&&!['.','..'].includes(part)&&
    !part.includes('/')&&!/^__.*__$/.test(part)&&Buffer.byteLength(part,'utf8')<=1500;
}
function documentNameBytes(path){
  if(typeof path!=='string')throw Error('INVALID_DOCUMENT_PATH');
  const parts=path.split('/');
  if(parts.length<2||parts.length%2!==0||parts.some(p=>!validPart(p)))
    throw Error('INVALID_DOCUMENT_PATH');
  const n=16+parts.reduce((total,p)=>total+strSize(p),0);
  if(n>6144)throw Error('DOCUMENT_NAME_LIMIT_EXCEEDED');
  return n;
}
function validateFields(node,depth=0,path=''){
  if(Array.isArray(node)){
    if(depth+1>MAX_FIELD_DEPTH)throw Error('FIRESTORE_FIELD_DEPTH_EXCEEDED');
    node.forEach(v=>validateFields(v,depth+1,path));
    return;
  }
  if(isRecord(node)){
    if(depth+1>MAX_FIELD_DEPTH)throw Error('FIRESTORE_FIELD_DEPTH_EXCEEDED');
    for(const [name,value] of Object.entries(node)){
      if(!validPart(name))throw Error('FIRESTORE_FIELD_NAME_INVALID');
      const fieldPath=path?path+'.'+name:name;
      // Conservatively refuse huge raw names. FieldPath quoting and
      // SDK field-mask encoding still need exact independent validation.
      if(Buffer.byteLength(fieldPath,'utf8')>1500)
        throw Error('FIRESTORE_FIELD_PATH_LIMIT_EXCEEDED');
      validateFields(value,depth+1,fieldPath);
    }
    return;
  }
  if(typeof node==='string'&&strSize(node)>FIELD_VALUE_LIMIT)
    throw Error('FIRESTORE_FIELD_VALUE_LIMIT_EXCEEDED');
}
function storageValueSize(value){
  if(value===null||typeof value==='boolean')return 1;
  if(typeof value==='number'&&Number.isFinite(value))return 8;
  if(typeof value==='string')return strSize(value);
  if(Array.isArray(value))return value.reduce((sum,item)=>sum+storageValueSize(item),0);
  if(isRecord(value))return 32+Object.entries(value).reduce(
    (sum,[k,v])=>sum+strSize(k)+storageValueSize(v),0);
  throw Error('UNSUPPORTED_FIRESTORE_VALUE');
}

/** Standard-edition storage SIZE ESTIMATE; never an encoded write authorization. */
export function estimateFirestoreDocumentStorageBytes(doc,path){
  if(!isRecord(doc))throw Error('INVALID_DOCUMENT_BODY');
  advisoryJsonSize(doc);
  validateFields(doc,-1);
  const nameBytes=documentNameBytes(path);
  return nameBytes+32+Object.entries(doc).reduce(
    (sum,[key,value])=>sum+strSize(key)+storageValueSize(value),0);
}

export function checkSizeGate(source,keyedDocs={}){
  let sourceJson=0, maxKeyed=0,sourceEstimate=0,maxKeyedEstimate=0;
  const keyedSizes={},keyedStorageEstimates={};
  try{
    if(!isRecord(source)||!isRecord(keyedDocs))
      throw Error('INVALID_SOURCE_OR_KEYED_DOCUMENTS');
    sourceJson=advisoryJsonSize(source);
    sourceEstimate=estimateFirestoreDocumentStorageBytes(source,'flottaSharedState/current');
    for(const [path,doc] of Object.entries(keyedDocs)){
      if(!/^flotta(Drivers|Vehicles)\/[^/]+$/.test(path))
        throw Error('INVALID_KEYED_DOCUMENT_PATH');
      const n=advisoryJsonSize(doc);
      keyedSizes[path]=n;
      maxKeyed=Math.max(maxKeyed,n);
      const estimated=estimateFirestoreDocumentStorageBytes(doc,path);
      keyedStorageEstimates[path]=estimated;
      maxKeyedEstimate=Math.max(maxKeyedEstimate,estimated);
    }
    const budgetOk=sourceJson<=CONSERVATIVE_JSON_BUDGET&&
      maxKeyed<=CONSERVATIVE_JSON_BUDGET;
    // A published storage-size estimate can rule an object OUT but never
    // certify that its actual transport encoding fits the 1 MiB limit.
    const storageEstimateOk=sourceEstimate<FIRESTORE_DOC_LIMIT&&
      maxKeyedEstimate<FIRESTORE_DOC_LIMIT;
    const advisoryOk=budgetOk&&storageEstimateOk;
    return {
      advisoryOk,sourceJsonBytes:sourceJson,maxKeyedJsonBytes:maxKeyed,
      sourceStorageEstimateBytes:sourceEstimate,
      maxKeyedStorageEstimateBytes:maxKeyedEstimate,
      keyedJsonBytes:keyedSizes,keyedStorageEstimates,
      firestoreEncodedSizeVerified:false,authorizedForImport:false,
      reason:!budgetOk?'CONSERVATIVE_JSON_BUDGET_EXCEEDED':
        !storageEstimateOk?'ESTIMATED_FIRESTORE_STORAGE_LIMIT_EXCEEDED':
          'ADVISORY_ONLY – Firestore encoded size remains unverified'
    };
  }catch(err){
    return {advisoryOk:false,sourceJsonBytes:sourceJson,
      maxKeyedJsonBytes:maxKeyed,sourceStorageEstimateBytes:sourceEstimate,
      maxKeyedStorageEstimateBytes:maxKeyedEstimate,
      firestoreEncodedSizeVerified:false,authorizedForImport:false,
      reason:'INVALID_SOURCE_OR_FIRESTORE_SHAPE: '+String(err.message||err)};
  }
}

export function generateLargeFixture(nDrivers,nVehicles){
  if(!Number.isSafeInteger(nDrivers)||!Number.isSafeInteger(nVehicles)||
    nDrivers<0||nVehicles<0||nDrivers>10000||nVehicles>10000)
    throw RangeError('Synthetic count outside bounded test range');
  const drivers=Array.from({length:nDrivers},(_,i)=>({
    id:'d'+i,daCode:'DA'+String(i).padStart(4,'0'),
    name:'Driver '+i,kapacitas:50,status:'aktiv',
    history:[{e:'hire',note:'synthetic '+i}]
  }));
  const vehicles=Array.from({length:nVehicles},(_,i)=>({
    id:'v'+i,rendszam:'PLATE'+String(i).padStart(4,'0'),
    status:'aktiv',history:[{e:'service'}]
  }));
  return {drivers,vehicles,fuelCards:[],contacts:[]};
}
