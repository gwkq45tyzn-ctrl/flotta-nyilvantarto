/** Capture untrusted JSON DATA once before verification or async transactions.
 * Accessors/functions/custom prototypes are not source data. Never invoke a
 * getter while deciding which signed bytes/checkpoint/source to trust.
 */
export function snapshotJsonData(root){
  const seen=new WeakSet();let nodes=0;
  const invalid=()=>{throw Error('INVALID_JSON_DATA_SNAPSHOT');};
  function copy(value,depth){
    if(++nodes>200000||depth>128)invalid();
    if(value===null||typeof value==='string'||typeof value==='boolean')return value;
    if(typeof value==='number'){if(!Number.isFinite(value))invalid();return value;}
    if(typeof value!=='object')invalid();
    const array=Array.isArray(value),proto=Object.getPrototypeOf(value);
    if(array?proto!==Array.prototype:proto!==Object.prototype&&proto!==null)invalid();
    if(seen.has(value))invalid();seen.add(value);
    const descriptors=Object.getOwnPropertyDescriptors(value),keys=Reflect.ownKeys(descriptors);
    const out=array?[]:Object.create(null);
    if(keys.some(k=>typeof k!=='string'))invalid();
    if(array){
      const length=descriptors.length?.value;
      if(!Number.isSafeInteger(length)||length<0||length>200000||keys.length!==length+1)invalid();
      for(let i=0;i<length;i++){
        const d=descriptors[String(i)];
        if(!d||!Object.hasOwn(d,'value')||!d.enumerable)invalid();
        out.push(copy(d.value,depth+1));
      }
    }else{
      for(const key of keys){
        const d=descriptors[key];
        if(!Object.hasOwn(d,'value')||!d.enumerable)invalid();
        out[key]=copy(d.value,depth+1);
      }
    }
    seen.delete(value);return Object.freeze(out);
  }
  try{return copy(root,0);}catch{throw Error('INVALID_JSON_DATA_SNAPSHOT');}
}
