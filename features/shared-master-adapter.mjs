/**
 * Safe, read-only projection from ORIGINAL Flotta to Depo master records.
 * Full original records (including history) stay in the private migration plan.
 * Never put the rich flotta sidecar inside strict /vehicles or /drivers writes.
 * No network calls, no Firebase writes, no cutover.
 */
const clone=x=>JSON.parse(JSON.stringify(x));
const str=x=>typeof x==='string'?x.trim():'';
// Normalize only characters both JavaScript and Firestore Rules agree on.
// Unicode case folds (dotless i / long s), NBSP, and Unicode dashes must
// NOT be able to collide with ordinary ASCII Fleet identities.
const plate=x=>typeof x==='string'&&/^[A-Za-z0-9 -]+$/.test(x)
  ?x.replace(/[ -]/g,'').toUpperCase():'';
const code=x=>typeof x==='string'&&/^[A-Za-z0-9_-]+$/.test(x)
  ?x.toUpperCase():'';
const plateOK=x=>/^[A-Z0-9]{4,12}$/.test(x);
const codeOK=x=>/^[A-Z0-9_-]{4,40}$/.test(x);
const statuses=Object.freeze(['Elérhető','Szerviz','Leállított']);
const vehicleStatus=s=>{
  const x=str(s).toLowerCase();
  if(['aktiv','aktív'].includes(x))return 'Elérhető';
  if(x==='szerviz')return 'Szerviz';
  return 'Leállított'; // fail-safe, never infer available from unknown status
};
const driverActive=s=>['aktiv','aktív'].includes(str(s).toLowerCase());
const capacityOf=d=>{
  const raw=d.kapacitas??d.capacity??0;
  if(typeof raw==='string'&&!raw.trim())return 0;
  const n=Number(raw);
  return Number.isSafeInteger(n)&&n>=0&&n<=10000?n:null;
};

export function fleetVehicleToDepo(v) {
  if(!v||typeof v!=='object'||Array.isArray(v))return null;
  const p=plate(v.rendszam),model=[str(v.gyartmany),str(v.modell)].filter(Boolean).join(' ');
  if(!plateOK(p)||model.length>160)return null;
  return {id:p,plate:p,model,status:vehicleStatus(v.status),flotta:clone(v)};
}
export function fleetDriverToDepo(d) {
  if(!d||typeof d!=='object'||Array.isArray(d))return null;
  // Original Flotta id is an internal generated ID, NOT the business DA code.
  const daCode=code(d.daCode),name=str(d.name||d.nev);
  const vendor=str(d.agency||d.vendor||d.vallalkozo),capacity=capacityOf(d);
  if(!codeOK(daCode)||!name||name.length>160||vendor.length>160||capacity===null)return null;
  return {id:daCode,daCode,name,vendor,capacity,active:driverActive(d.status),flotta:clone(d)};
}
export function depoVehicleWrite(v) {
  if(!v||v.id!==v.plate||!plateOK(str(v.plate))||
     typeof v.model!=='string'||v.model.length>160||!statuses.includes(v.status))return null;
  return {id:v.id,data:{plate:v.plate,model:v.model,status:v.status}};
}
export function depoDriverWrite(d) {
  if(!d||d.id!==d.daCode||!codeOK(str(d.daCode))||
     typeof d.name!=='string'||!d.name.trim()||d.name.length>160||
     typeof d.vendor!=='string'||d.vendor.length>160||
     !Number.isSafeInteger(d.capacity)||d.capacity<0||d.capacity>10000||
     typeof d.active!=='boolean')return null;
  return {id:d.id,data:{name:d.name,daCode:d.daCode,vendor:d.vendor,capacity:d.capacity,active:d.active}};
}
// Reduced Depo records are NEVER safe to restore over full original Flotta.
export const depoToFleetVehicle=doc=>doc?.flotta?clone(doc.flotta):null;
export const depoToFleetDriver=doc=>doc?.flotta?clone(doc.flotta):null;

export function planSharedMigration(snapshot) {
  if(!snapshot||typeof snapshot!=='object'||Array.isArray(snapshot)||
     !['vehicles','drivers','fuelCards','contacts'].every(k=>Array.isArray(snapshot[k])))
    throw Error('Incomplete original Flotta snapshot (four arrays required)');
  const issues=[],vehicles=[],drivers=[],vWrites=[],dWrites=[];
  const seenV=new Set(),seenD=new Set();
  snapshot.vehicles.forEach((raw,index)=>{
    const v=fleetVehicleToDepo(raw);
    if(!v){issues.push({kind:'vehicle',index,reason:'invalid/missing plate or model'});return;}
    if(seenV.has(v.id)){issues.push({kind:'vehicle',index,reason:'duplicate normalized plate',id:v.id});return;}
    seenV.add(v.id);
    if(!['aktiv','aktív','szerviz','leállított','leallitott'].includes(str(raw.status).toLowerCase()))
      issues.push({kind:'vehicle',index,reason:'unknown source status',id:v.id});
    vehicles.push(v);vWrites.push(depoVehicleWrite(v));
  });
  snapshot.drivers.forEach((raw,index)=>{
    const d=fleetDriverToDepo(raw);
    if(!d){issues.push({kind:'driver',index,reason:'missing/invalid DA code, name, vendor or capacity'});return;}
    if(seenD.has(d.id)){issues.push({kind:'driver',index,reason:'duplicate normalized DA code',id:d.id});return;}
    seenD.add(d.id);
    if(!['aktiv','aktív','inaktiv','inaktív'].includes(str(raw.status).toLowerCase()))
      issues.push({kind:'driver',index,reason:'unverified source status',id:d.id});
    drivers.push(d);dWrites.push(depoDriverWrite(d));
  });
  const source=clone(snapshot);
  return {
    ready:issues.length===0&&vehicles.length===snapshot.vehicles.length&&drivers.length===snapshot.drivers.length,
    issues,vehicles,drivers,writes:{vehicles:vWrites,drivers:dWrites},source,
    preservedVehicleFields:vehicles.every(v=>!!v.flotta?.rendszam),
    preservedDriverFields:drivers.every(d=>!!d.flotta?.id),
    counts:{
      vehicles:vehicles.length,drivers:drivers.length,
      fuelCards:snapshot.fuelCards.length,contacts:snapshot.contacts.length,
      vehicleHistory:snapshot.vehicles.reduce((n,v)=>n+(Array.isArray(v?.history)?v.history.length:0),0),
      driverHistory:snapshot.drivers.reduce((n,v)=>n+(Array.isArray(v?.history)?v.history.length:0),0)
    }
  };
}
