/**
 * Canonical staging Fleet master-record input validation.
 * Matches Firestore rules, without changing production Fleet or migrating data.
 */
const codePattern=/^[A-Z0-9_-]{4,40}$/;
const platePattern=/^[A-Z0-9]{4,12}$/;
const statuses=Object.freeze(['Elérhető','Szerviz','Leállított']);
const ensure=(condition,message)=>{if(!condition)throw Error(message);};
const str=value=>typeof value==='string'?value.trim():'';
export function normalizedDriver(values) {
  const daCode=str(values.daCode).toUpperCase();
  const name=str(values.name);
  const vendor=str(values.vendor);
  const rawCapacity=str(String(values.capacity??''));
  const capacity=Number(rawCapacity);
  const active=values.active===true||values.active==='true';
  ensure(codePattern.test(daCode),'A DA-kód 4–40 nagybetűt, számot, _ vagy - jelet tartalmazhat.');
  ensure(name.length>=1&&name.length<=160,'A futárnév 1–160 karakter lehet.');
  ensure(vendor.length<=160,'A vállalkozó neve legfeljebb 160 karakter lehet.');
  ensure(/^(0|[1-9]\d*)$/.test(rawCapacity)&&Number.isSafeInteger(capacity)&&capacity<=10000,
    'A kapacitás 0–10000 egész szám lehet.');
  ensure(['true','false'].includes(String(values.active)),
    'Az aktív állapot igaz vagy hamis kell legyen.');
  return Object.freeze({id:daCode,data:{daCode,name,vendor,capacity,active}});
}
export function normalizedVehicle(values){
  const plate=str(values.plate).replace(/[\s-]/g,'').toUpperCase();
  const model=str(values.model);
  const status=str(values.status);
  ensure(platePattern.test(plate),'A rendszám 4–12 betűt vagy számot tartalmazhat.');
  ensure(model.length<=160,'A modell neve legfeljebb 160 karakter lehet.');
  ensure(statuses.includes(status),'Érvénytelen járműállapot.');
  return Object.freeze({id:plate,data:{plate,model,status}});
}
export function sameRecord(actual,expected){
  if(!actual||!expected)return false;
  const keys=Object.keys(expected);
  return Object.keys(actual).length===keys.length&&
    keys.every(k=>Object.prototype.hasOwnProperty.call(actual,k)&&actual[k]===expected[k]);
}
export const fleetStatuses=statuses;
